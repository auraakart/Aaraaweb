import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { NotificationRealtimeService } from '../notifications/notification-realtime.service';
import { PrismaService } from '../prisma/prisma.service';

const UNCOLLECTED_OVERDUE_HOURS = 24;
const PICKUP_CODE_TTL_MINUTES = 10;
const PICKUP_CODE_MAX_ATTEMPTS = 5;

type IntakeInput = {
  unitId: string;
  recipientUserId: string;
  courierName?: string;
  trackingReference?: string;
  notes?: string;
};

const pickupDigest = (salt: string, code: string) => createHash('sha256').update(`${salt}:${code}`).digest('hex');

@Injectable()
export class ParcelsService {
  constructor(private readonly prisma: PrismaService, private readonly realtime?: NotificationRealtimeService) {}

  listOwn(societyId: string, userId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT p.*,
        (p."status"='RECEIVED' AND p."receivedAt" < CURRENT_TIMESTAMP - make_interval(hours => ${UNCOLLECTED_OVERDUE_HOURS})) AS "overdue"
      FROM "Parcel" p
      WHERE p."societyId"=${societyId}::uuid AND p."recipientUserId"=${userId}::uuid
      ORDER BY CASE p."status" WHEN 'RECEIVED' THEN 0 ELSE 1 END, p."receivedAt" DESC
    `);
  }

  listDesk(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT p.*, u."number" AS "unitNumber",
        recipient."name" AS "recipientName",
        (p."receivedAt" < CURRENT_TIMESTAMP - make_interval(hours => ${UNCOLLECTED_OVERDUE_HOURS})) AS "overdue"
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

    const parcel = await this.prisma.$transaction(async (tx) => {
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
      const created = rows[0];
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ParcelEvent" ("societyId","parcelId","actorUserId","action","note")
        VALUES (${societyId}::uuid,${created.id}::uuid,${actorUserId}::uuid,'RECEIVED',${courierName})
      `);
      return created;
    });

    this.realtime?.publishResident({
      type: 'PARCEL_RECEIVED',
      societyId,
      userId: input.recipientUserId,
      unitId: input.unitId,
      parcelId: parcel.id,
      title: 'Parcel received',
      body: courierName ? `A parcel from ${courierName} is waiting at the gate.` : 'A parcel is waiting for you at the gate.',
      createdAt: new Date().toISOString(),
    });

    return parcel;
  }

  async issuePickupCode(societyId: string, userId: string, parcelId: string) {
    const code = randomInt(100000, 1000000).toString();
    const salt = randomBytes(16).toString('hex');
    const digest = pickupDigest(salt, code);
    const rows = await this.prisma.$queryRaw<Array<{ id: string; pickupCodeExpiresAt: Date }>>(Prisma.sql`
      UPDATE "Parcel"
      SET "pickupCodeSalt"=${salt}, "pickupCodeHash"=${digest},
          "pickupCodeIssuedAt"=CURRENT_TIMESTAMP,
          "pickupCodeExpiresAt"=CURRENT_TIMESTAMP + make_interval(mins => ${PICKUP_CODE_TTL_MINUTES}),
          "pickupCodeAttempts"=0, "pickupCodeLockedAt"=NULL, "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${parcelId}::uuid AND "societyId"=${societyId}::uuid
        AND "recipientUserId"=${userId}::uuid AND "status"='RECEIVED'
      RETURNING "id","pickupCodeExpiresAt"
    `);
    const parcel = rows[0];
    if (!parcel) throw new NotFoundException('Uncollected parcel not found for current user');
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "ParcelEvent" ("societyId","parcelId","actorUserId","action")
      VALUES (${societyId}::uuid,${parcelId}::uuid,${userId}::uuid,'PICKUP_CODE_ISSUED')
    `);
    return { parcelId, code, expiresAt: parcel.pickupCodeExpiresAt.toISOString(), maxAttempts: PICKUP_CODE_MAX_ATTEMPTS };
  }

  async collectWithPickupCode(societyId: string, actorUserId: string, parcelId: string, code: string) {
    const normalized = code.trim();
    if (!/^\d{6}$/.test(normalized)) throw new BadRequestException('Pickup code must be 6 digits');

    const outcome = await this.prisma.$transaction(async (tx) => {
      const [parcel] = await tx.$queryRaw<Array<{
        id: string; recipientUserId: string; status: string; pickupCodeSalt: string | null; pickupCodeHash: string | null;
        pickupCodeExpiresAt: Date | null; pickupCodeAttempts: number; pickupCodeLockedAt: Date | null;
      }>>(Prisma.sql`
        SELECT "id","recipientUserId","status","pickupCodeSalt","pickupCodeHash","pickupCodeExpiresAt","pickupCodeAttempts","pickupCodeLockedAt"
        FROM "Parcel"
        WHERE "id"=${parcelId}::uuid AND "societyId"=${societyId}::uuid
        FOR UPDATE
      `);
      if (!parcel || parcel.status !== 'RECEIVED') return { ok: false as const, reason: 'Uncollected parcel not found' };
      if (!parcel.pickupCodeSalt || !parcel.pickupCodeHash || !parcel.pickupCodeExpiresAt) return { ok: false as const, reason: 'Pickup code has not been issued' };
      if (parcel.pickupCodeLockedAt || parcel.pickupCodeAttempts >= PICKUP_CODE_MAX_ATTEMPTS) return { ok: false as const, reason: 'Pickup code is locked; resident must generate a new code' };
      if (parcel.pickupCodeExpiresAt.getTime() <= Date.now()) return { ok: false as const, reason: 'Pickup code has expired; resident must generate a new code' };

      if (pickupDigest(parcel.pickupCodeSalt, normalized) !== parcel.pickupCodeHash) {
        const nextAttempts = parcel.pickupCodeAttempts + 1;
        const locked = nextAttempts >= PICKUP_CODE_MAX_ATTEMPTS;
        await tx.$executeRaw(Prisma.sql`
          UPDATE "Parcel"
          SET "pickupCodeAttempts"=${nextAttempts}, "pickupCodeLockedAt"=CASE WHEN ${locked} THEN CURRENT_TIMESTAMP ELSE NULL END,
              "updatedAt"=CURRENT_TIMESTAMP
          WHERE "id"=${parcelId}::uuid AND "societyId"=${societyId}::uuid
        `);
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "ParcelEvent" ("societyId","parcelId","actorUserId","action","note")
          VALUES (${societyId}::uuid,${parcelId}::uuid,${actorUserId}::uuid,${locked ? 'PICKUP_CODE_LOCKED' : 'PICKUP_CODE_FAILED'},${`Attempt ${nextAttempts}`})
        `);
        return { ok: false as const, reason: locked ? 'Pickup code locked after too many attempts' : 'Invalid pickup code' };
      }

      const [collected] = await tx.$queryRaw<Array<{ id: string; status: string; collectedAt: Date }>>(Prisma.sql`
        UPDATE "Parcel"
        SET "status"='COLLECTED', "collectedByUserId"=${parcel.recipientUserId}::uuid, "collectedAt"=CURRENT_TIMESTAMP,
            "pickupCodeSalt"=NULL, "pickupCodeHash"=NULL, "pickupCodeIssuedAt"=NULL, "pickupCodeExpiresAt"=NULL,
            "pickupCodeAttempts"=0, "pickupCodeLockedAt"=NULL, "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${parcelId}::uuid AND "societyId"=${societyId}::uuid AND "status"='RECEIVED'
        RETURNING "id","status","collectedAt"
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ParcelEvent" ("societyId","parcelId","actorUserId","action") VALUES
          (${societyId}::uuid,${parcelId}::uuid,${actorUserId}::uuid,'PICKUP_CODE_VERIFIED'),
          (${societyId}::uuid,${parcelId}::uuid,${actorUserId}::uuid,'COLLECTED')
      `);
      return { ok: true as const, parcel: collected };
    });

    if (!outcome.ok) throw new BadRequestException(outcome.reason);
    return outcome.parcel;
  }

  async confirmCollection(societyId: string, userId: string, parcelId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string; collectedAt: Date }>>(Prisma.sql`
        UPDATE "Parcel"
        SET "status"='COLLECTED', "collectedByUserId"=${userId}::uuid, "collectedAt"=CURRENT_TIMESTAMP,
            "pickupCodeSalt"=NULL, "pickupCodeHash"=NULL, "pickupCodeIssuedAt"=NULL, "pickupCodeExpiresAt"=NULL,
            "pickupCodeAttempts"=0, "pickupCodeLockedAt"=NULL, "updatedAt"=CURRENT_TIMESTAMP
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
            "returnReason"=${cleanReason}, "pickupCodeSalt"=NULL, "pickupCodeHash"=NULL, "pickupCodeIssuedAt"=NULL,
            "pickupCodeExpiresAt"=NULL, "pickupCodeAttempts"=0, "pickupCodeLockedAt"=NULL, "updatedAt"=CURRENT_TIMESTAMP
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
