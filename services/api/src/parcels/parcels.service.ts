import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const UNCOLLECTED_OVERDUE_HOURS = 24;

type IntakeInput = {
  unitId: string;
  recipientUserId: string;
  courierName?: string;
  trackingReference?: string;
  notes?: string;
};

@Injectable()
export class ParcelsService {
  constructor(private readonly prisma: PrismaService) {}

  listOwn(societyId: string, userId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT p.*,
        (p."status"='RECEIVED' AND p."receivedAt" < CURRENT_TIMESTAMP - INTERVAL '${UNCOLLECTED_OVERDUE_HOURS} hours') AS "overdue"
      FROM "Parcel" p
      WHERE p."societyId"=${societyId}::uuid AND p."recipientUserId"=${userId}::uuid
      ORDER BY CASE p."status" WHEN 'RECEIVED' THEN 0 ELSE 1 END, p."receivedAt" DESC
    `);
  }

  listDesk(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT p.*, u."unitNumber",
        recipient."name" AS "recipientName",
        (p."receivedAt" < CURRENT_TIMESTAMP - INTERVAL '${UNCOLLECTED_OVERDUE_HOURS} hours') AS "overdue"
      FROM "Parcel" p
      JOIN "Unit" u ON u."id"=p."unitId" AND u."societyId"=p."societyId"
      JOIN "User" recipient ON recipient."id"=p."recipientUserId"
      WHERE p."societyId"=${societyId}::uuid AND p."status"='RECEIVED'
      ORDER BY "overdue" DESC, p."receivedAt" ASC
    `);
  }

  async intake(societyId: string, actorUserId: string, input: IntakeInput) {
    const courierName = input.courierName?.trim() || null;
    const trackingReference = input.trackingReference?.trim() || null;
    const notes = input.notes?.trim() || null;
    if (courierName && courierName.length > 120) throw new BadRequestException('Courier name is too long');
    if (trackingReference && trackingReference.length > 160) throw new BadRequestException('Tracking reference is too long');
    if (notes && notes.length > 500) throw new BadRequestException('Parcel notes are too long');

    return this.prisma.$transaction(async (tx) => {
      const occupancy = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT uo."id"
        FROM "UnitOccupancy" uo
        JOIN "Unit" u ON u."id"=uo."unitId" AND u."societyId"=uo."societyId"
        WHERE uo."societyId"=${societyId}::uuid
          AND uo."unitId"=${input.unitId}::uuid
          AND uo."userId"=${input.recipientUserId}::uuid
          AND uo."active"=true
          AND uo."effectiveFrom"<=CURRENT_TIMESTAMP
          AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)
        LIMIT 1
        FOR SHARE OF uo
      `);
      if (!occupancy[0]) throw new BadRequestException('Parcel recipient must be a current occupant of the unit');

      const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
        INSERT INTO "Parcel" (
          "societyId","unitId","recipientUserId","courierName","trackingReference","notes","receivedByUserId"
        ) VALUES (
          ${societyId}::uuid,${input.unitId}::uuid,${input.recipientUserId}::uuid,${courierName},${trackingReference},${notes},${actorUserId}::uuid
        )
        RETURNING *
      `);
      const parcel = rows[0];
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ParcelEvent" ("societyId","parcelId","actorUserId","action","note")
        VALUES (${societyId}::uuid,${parcel.id}::uuid,${actorUserId}::uuid,'RECEIVED',${courierName})
      `);
      return parcel;
    });
  }

  async confirmCollection(societyId: string, userId: string, parcelId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string; collectedAt: Date }>>(Prisma.sql`
        UPDATE "Parcel"
        SET "status"='COLLECTED', "collectedByUserId"=${userId}::uuid, "collectedAt"=CURRENT_TIMESTAMP, "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${parcelId}::uuid AND "societyId"=${societyId}::uuid
          AND "recipientUserId"=${userId}::uuid AND "status"='RECEIVED'
        RETURNING "id","status","collectedAt"
      `);
      const parcel = rows[0];
      if (!parcel) throw new NotFoundException('Uncollected parcel not found for current user');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ParcelEvent" ("societyId","parcelId","actorUserId","action")
        VALUES (${societyId}::uuid,${parcelId}::uuid,${userId}::uuid,'COLLECTED')
      `);
      return parcel;
    });
  }

  async returnToSender(societyId: string, actorUserId: string, parcelId: string, reason: string) {
    const cleanReason = reason.trim();
    if (cleanReason.length < 3 || cleanReason.length > 500) throw new BadRequestException('Return reason must be between 3 and 500 characters');
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string; returnedAt: Date }>>(Prisma.sql`
        UPDATE "Parcel"
        SET "status"='RETURNED', "returnedByUserId"=${actorUserId}::uuid, "returnedAt"=CURRENT_TIMESTAMP,
            "returnReason"=${cleanReason}, "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${parcelId}::uuid AND "societyId"=${societyId}::uuid AND "status"='RECEIVED'
        RETURNING "id","status","returnedAt"
      `);
      const parcel = rows[0];
      if (!parcel) throw new NotFoundException('Uncollected parcel not found');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ParcelEvent" ("societyId","parcelId","actorUserId","action","note")
        VALUES (${societyId}::uuid,${parcelId}::uuid,${actorUserId}::uuid,'RETURNED',${cleanReason})
      `);
      return parcel;
    });
  }

  history(societyId: string, parcelId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT pe.*, actor."name" AS "actorName"
      FROM "ParcelEvent" pe
      JOIN "User" actor ON actor."id"=pe."actorUserId"
      WHERE pe."societyId"=${societyId}::uuid AND pe."parcelId"=${parcelId}::uuid
      ORDER BY pe."occurredAt" ASC
    `);
  }
}
