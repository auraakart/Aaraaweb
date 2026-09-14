import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationRealtimeService } from '../notifications/notification-realtime.service';

type ParcelStatus = 'RECEIVED' | 'COLLECTED' | 'RETURNED';
type PackageType = 'PACKAGE' | 'DOCUMENT' | 'FOOD' | 'OTHER';

type ParcelRow = {
  id: string;
  societyId: string;
  unitId: string;
  carrier: string | null;
  trackingReference: string | null;
  recipientName: string | null;
  packageType: PackageType;
  status: ParcelStatus;
  notes: string | null;
  receivedAt: Date;
};

@Injectable()
export class ParcelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime?: NotificationRealtimeService,
  ) {}

  listDesk(societyId: string, status?: ParcelStatus) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT p.*, u."label" AS "unitLabel"
      FROM "ParcelRecord" p
      JOIN "Unit" u ON u."id"=p."unitId" AND u."societyId"=p."societyId"
      WHERE p."societyId"=${societyId}::uuid
        AND (${status ?? null}::text IS NULL OR p."status"=${status ?? null})
      ORDER BY CASE p."status" WHEN 'RECEIVED' THEN 0 ELSE 1 END, p."receivedAt" DESC
    `);
  }

  listMine(societyId: string, userId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT p.*, pr."recipientType", pr."readAt"
      FROM "ParcelRecipient" pr
      JOIN "ParcelRecord" p ON p."id"=pr."parcelId" AND p."societyId"=pr."societyId"
      WHERE pr."societyId"=${societyId}::uuid AND pr."userId"=${userId}::uuid
      ORDER BY CASE p."status" WHEN 'RECEIVED' THEN 0 ELSE 1 END, p."receivedAt" DESC
    `);
  }

  async receive(
    societyId: string,
    actorUserId: string,
    input: {
      unitId: string;
      carrier?: string;
      trackingReference?: string;
      recipientName?: string;
      packageType?: PackageType;
      notes?: string;
    },
  ) {
    const carrier = this.clean(input.carrier, 120);
    const trackingReference = this.clean(input.trackingReference, 180);
    const recipientName = this.clean(input.recipientName, 160);
    const notes = this.clean(input.notes, 1000);

    const parcel = await this.prisma.$transaction(async (tx) => {
      const units = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "Unit"
        WHERE "id"=${input.unitId}::uuid AND "societyId"=${societyId}::uuid
        FOR SHARE
      `);
      if (!units[0]) throw new BadRequestException('Unit is not in current society');

      const rows = await tx.$queryRaw<ParcelRow[]>(Prisma.sql`
        INSERT INTO "ParcelRecord" (
          "societyId","unitId","carrier","trackingReference","recipientName","packageType","notes","receivedByUserId"
        ) VALUES (
          ${societyId}::uuid,${input.unitId}::uuid,${carrier},${trackingReference},${recipientName},${input.packageType ?? 'PACKAGE'},${notes},${actorUserId}::uuid
        ) RETURNING *
      `);
      const created = rows[0];

      const occupantCount = await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ParcelRecipient" ("societyId","parcelId","userId","recipientType")
        SELECT ${societyId}::uuid, ${created.id}::uuid, uo."userId", 'OCCUPANT'
        FROM "UnitOccupancy" uo
        WHERE uo."societyId"=${societyId}::uuid AND uo."unitId"=${input.unitId}::uuid
          AND uo."active"=true AND uo."effectiveFrom"<=CURRENT_TIMESTAMP
          AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)
        GROUP BY uo."userId"
        ON CONFLICT ("parcelId","userId") DO NOTHING
      `);

      if (occupantCount === 0) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "ParcelRecipient" ("societyId","parcelId","userId","recipientType")
          SELECT ${societyId}::uuid, ${created.id}::uuid, uo."userId", 'OWNER_FALLBACK'
          FROM "UnitOwnership" uo
          WHERE uo."societyId"=${societyId}::uuid AND uo."unitId"=${input.unitId}::uuid
            AND uo."verified"=true AND uo."active"=true AND uo."effectiveFrom"<=CURRENT_TIMESTAMP
            AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)
          GROUP BY uo."userId"
          ON CONFLICT ("parcelId","userId") DO NOTHING
        `);
      }

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ParcelEvent" ("societyId","parcelId","actorUserId","action","toStatus")
        VALUES (${societyId}::uuid,${created.id}::uuid,${actorUserId}::uuid,'RECEIVED','RECEIVED')
      `);
      return created;
    });

    if (this.realtime) {
      const recipients = await this.recipients(societyId, parcel.id);
      recipients.forEach(({ userId }) => this.realtime?.publishResident({
        type: 'PARCEL_RECEIVED',
        societyId,
        userId,
        unitId: parcel.unitId,
        parcelId: parcel.id,
        title: 'Parcel received at the gate',
        body: parcel.carrier ? `${parcel.carrier} package is waiting for collection.` : 'A package is waiting for collection.',
        createdAt: new Date().toISOString(),
      }));
    }
    return parcel;
  }

  async markRead(societyId: string, userId: string, parcelId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ parcelId: string; readAt: Date }>>(Prisma.sql`
        UPDATE "ParcelRecipient"
        SET "readAt"=COALESCE("readAt",CURRENT_TIMESTAMP)
        WHERE "societyId"=${societyId}::uuid AND "parcelId"=${parcelId}::uuid AND "userId"=${userId}::uuid
        RETURNING "parcelId","readAt"
      `);
      if (!rows[0]) throw new NotFoundException('Parcel is not assigned to current user');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ParcelEvent" ("societyId","parcelId","actorUserId","action")
        VALUES (${societyId}::uuid,${parcelId}::uuid,${userId}::uuid,'READ')
      `);
      return rows[0];
    });
  }

  async collect(societyId: string, actorUserId: string, parcelId: string, collectorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const recipients = await tx.$queryRaw<Array<{ userId: string }>>(Prisma.sql`
        SELECT "userId" FROM "ParcelRecipient"
        WHERE "societyId"=${societyId}::uuid AND "parcelId"=${parcelId}::uuid AND "userId"=${collectorUserId}::uuid
        FOR SHARE
      `);
      if (!recipients[0]) throw new BadRequestException('Collector is not an authorized parcel recipient');

      const rows = await tx.$queryRaw<ParcelRow[]>(Prisma.sql`
        UPDATE "ParcelRecord"
        SET "status"='COLLECTED',"collectedByUserId"=${collectorUserId}::uuid,"collectedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${parcelId}::uuid AND "societyId"=${societyId}::uuid AND "status"='RECEIVED'
        RETURNING *
      `);
      if (!rows[0]) throw new BadRequestException('Parcel changed, is not waiting for collection, or was not found');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ParcelEvent" ("societyId","parcelId","actorUserId","action","fromStatus","toStatus","metadataJson")
        VALUES (${societyId}::uuid,${parcelId}::uuid,${actorUserId}::uuid,'COLLECTED','RECEIVED','COLLECTED',${JSON.stringify({ collectorUserId })}::jsonb)
      `);
      return rows[0];
    });
  }

  async returnParcel(societyId: string, actorUserId: string, parcelId: string, note?: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ParcelRow[]>(Prisma.sql`
        UPDATE "ParcelRecord"
        SET "status"='RETURNED',"returnedByUserId"=${actorUserId}::uuid,"returnedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${parcelId}::uuid AND "societyId"=${societyId}::uuid AND "status"='RECEIVED'
        RETURNING *
      `);
      if (!rows[0]) throw new BadRequestException('Parcel changed, is not waiting at the gate, or was not found');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ParcelEvent" ("societyId","parcelId","actorUserId","action","fromStatus","toStatus","metadataJson")
        VALUES (${societyId}::uuid,${parcelId}::uuid,${actorUserId}::uuid,'RETURNED','RECEIVED','RETURNED',${JSON.stringify({ note: this.clean(note, 500) })}::jsonb)
      `);
      return rows[0];
    });
  }

  async history(societyId: string, parcelId: string) {
    const exists = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "ParcelRecord" WHERE "id"=${parcelId}::uuid AND "societyId"=${societyId}::uuid LIMIT 1
    `);
    if (!exists[0]) throw new NotFoundException('Parcel not found');
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT pe.*, u."name" AS "actorName"
      FROM "ParcelEvent" pe
      JOIN "User" u ON u."id"=pe."actorUserId"
      WHERE pe."societyId"=${societyId}::uuid AND pe."parcelId"=${parcelId}::uuid
      ORDER BY pe."occurredAt" ASC
    `);
  }

  private recipients(societyId: string, parcelId: string) {
    return this.prisma.$queryRaw<Array<{ userId: string }>>(Prisma.sql`
      SELECT "userId" FROM "ParcelRecipient"
      WHERE "societyId"=${societyId}::uuid AND "parcelId"=${parcelId}::uuid
    `);
  }

  private clean(value: string | undefined, max: number) {
    const cleaned = value?.trim() || null;
    if (cleaned && cleaned.length > max) throw new BadRequestException(`Value must not exceed ${max} characters`);
    return cleaned;
  }
}
