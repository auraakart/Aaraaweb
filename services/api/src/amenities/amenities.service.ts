import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type AmenityRow = {
  id: string;
  societyId: string;
  code: string;
  name: string;
  description: string | null;
  location: string | null;
  schedule: unknown;
  bookingRules: unknown;
  feePaise: number;
  currency: string;
  requiresApproval: boolean;
  slotMinutes: number;
  maxConcurrentBookings: number;
  active: boolean;
};

type CountRow = { count: bigint | number };

type AmenityBookingRules = {
  minAdvanceMinutes?: number;
  maxAdvanceDays?: number;
  maxFutureBookingsPerUnit?: number;
  cancellationCutoffMinutes?: number;
  checkInOpenMinutesBefore?: number;
  noShowGraceMinutes?: number;
};

type AmenityUpdateInput = {
  name: string;
  description?: string | null;
  location?: string | null;
  schedule?: Record<string, unknown>;
  bookingRules?: Record<string, unknown>;
  feePaise: number;
  requiresApproval: boolean;
  slotMinutes: number;
  maxConcurrentBookings: number;
  active: boolean;
};

@Injectable()
export class AmenitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async listAvailable(societyId: string) {
    return this.prisma.$queryRaw<AmenityRow[]>`
      SELECT "id", "societyId", "code", "name", "description", "location", "schedule",
             "bookingRules", "feePaise", "currency", "requiresApproval", "slotMinutes",
             "maxConcurrentBookings", "active"
      FROM "Amenity"
      WHERE "societyId" = ${societyId}::uuid AND "active" = true
      ORDER BY "name" ASC
    `;
  }

  async listMine(societyId: string, userId: string, unitId: string) {
    await this.assertUnitAccess(societyId, userId, unitId);
    return this.prisma.$queryRaw`
      SELECT b.*, a."name" AS "amenityName", a."code" AS "amenityCode"
      FROM "AmenityBooking" b
      JOIN "Amenity" a ON a."id" = b."amenityId" AND a."societyId" = b."societyId"
      WHERE b."societyId" = ${societyId}::uuid
        AND b."userId" = ${userId}::uuid
        AND b."unitId" = ${unitId}::uuid
      ORDER BY b."startsAt" DESC
    `;
  }

  async createBooking(
    societyId: string,
    userId: string,
    amenityId: string,
    input: { unitId: string; startsAt: string; endsAt: string; idempotencyKey?: string },
  ) {
    await this.assertUnitAccess(societyId, userId, input.unitId);
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || startsAt >= endsAt) {
      throw new BadRequestException('A valid booking window is required');
    }
    const now = Date.now();
    if (startsAt.getTime() <= now) throw new BadRequestException('Amenity bookings must start in the future');

    const idempotencyKey = input.idempotencyKey?.trim() || null;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${societyId}:${amenityId}`}))`;

      if (idempotencyKey) {
        const existing = await tx.$queryRaw<Array<{ id: string; amenityId: string; unitId: string; startsAt: Date; endsAt: Date }>>`
          SELECT "id","amenityId","unitId","startsAt","endsAt"
          FROM "AmenityBooking"
          WHERE "societyId"=${societyId}::uuid AND "userId"=${userId}::uuid
            AND "idempotencyKey"=${idempotencyKey}
          LIMIT 1
        `;
        if (existing[0]) {
          const samePayload = existing[0].amenityId === amenityId
            && existing[0].unitId === input.unitId
            && existing[0].startsAt.getTime() === startsAt.getTime()
            && existing[0].endsAt.getTime() === endsAt.getTime();
          if (!samePayload) throw new ConflictException('Idempotency key is already used for another amenity booking');
          const replay = await tx.$queryRaw`
            SELECT * FROM "AmenityBooking"
            WHERE "id"=${existing[0].id}::uuid AND "societyId"=${societyId}::uuid
            LIMIT 1
          `;
          return Array.isArray(replay) ? replay[0] : replay;
        }
      }

      const amenities = await tx.$queryRaw<AmenityRow[]>`
        SELECT "id", "societyId", "code", "name", "description", "location", "schedule",
               "bookingRules", "feePaise", "currency", "requiresApproval", "slotMinutes",
               "maxConcurrentBookings", "active"
        FROM "Amenity"
        WHERE "id" = ${amenityId}::uuid AND "societyId" = ${societyId}::uuid AND "active" = true
        LIMIT 1
      `;
      const amenity = amenities[0];
      if (!amenity) throw new NotFoundException('Amenity not found');

      const durationMinutes = (endsAt.getTime() - startsAt.getTime()) / 60000;
      if (durationMinutes !== amenity.slotMinutes) {
        throw new BadRequestException(`Booking duration must be exactly ${amenity.slotMinutes} minutes`);
      }

      const rules = this.parseBookingRules(amenity.bookingRules);
      const minutesUntilStart = (startsAt.getTime() - now) / 60000;
      if (rules.minAdvanceMinutes !== undefined && minutesUntilStart < rules.minAdvanceMinutes) {
        throw new BadRequestException(`Amenity must be booked at least ${rules.minAdvanceMinutes} minutes in advance`);
      }
      if (rules.maxAdvanceDays !== undefined && minutesUntilStart > rules.maxAdvanceDays * 24 * 60) {
        throw new BadRequestException(`Amenity cannot be booked more than ${rules.maxAdvanceDays} days in advance`);
      }

      if (rules.maxFutureBookingsPerUnit !== undefined) {
        const futureRows = await tx.$queryRaw<CountRow[]>`
          SELECT COUNT(*)::int AS "count"
          FROM "AmenityBooking"
          WHERE "societyId" = ${societyId}::uuid
            AND "amenityId" = ${amenityId}::uuid
            AND "unitId" = ${input.unitId}::uuid
            AND "status" IN ('PENDING', 'CONFIRMED', 'CHECKED_IN')
            AND "endsAt" > CURRENT_TIMESTAMP
        `;
        if (Number(futureRows[0]?.count ?? 0) >= rules.maxFutureBookingsPerUnit) {
          throw new ConflictException('Unit has reached the future booking limit for this amenity');
        }
      }

      const overlaps = await tx.$queryRaw<CountRow[]>`
        SELECT COUNT(*)::int AS "count"
        FROM "AmenityBooking"
        WHERE "societyId" = ${societyId}::uuid
          AND "amenityId" = ${amenityId}::uuid
          AND "status" IN ('PENDING', 'CONFIRMED', 'CHECKED_IN')
          AND "startsAt" < ${endsAt}
          AND "endsAt" > ${startsAt}
      `;
      const activeOverlapCount = Number(overlaps[0]?.count ?? 0);
      if (activeOverlapCount >= amenity.maxConcurrentBookings) {
        throw new ConflictException('Amenity slot is no longer available');
      }

      const status = amenity.requiresApproval ? 'PENDING' : 'CONFIRMED';
      const rows = await tx.$queryRaw`
        INSERT INTO "AmenityBooking" (
          "societyId", "amenityId", "unitId", "userId", "startsAt", "endsAt",
          "status", "feePaise", "currency", "idempotencyKey"
        ) VALUES (
          ${societyId}::uuid, ${amenityId}::uuid, ${input.unitId}::uuid, ${userId}::uuid,
          ${startsAt}, ${endsAt}, ${status}::"AmenityBookingStatus", ${amenity.feePaise}, ${amenity.currency},
          ${idempotencyKey}
        )
        RETURNING *
      `;
      return Array.isArray(rows) ? rows[0] : rows;
    }).catch((error) => {
      if (this.isUniqueViolation(error)) throw new ConflictException('Amenity booking already exists for this unit, slot or idempotency key');
      throw error;
    });
  }

  async listWaitlistMine(societyId: string, userId: string, unitId: string) {
    await this.assertUnitAccess(societyId, userId, unitId);
    return this.prisma.$queryRaw`
      SELECT w.*, a."name" AS "amenityName", a."code" AS "amenityCode",
             CASE WHEN w."status"='WAITING' THEN (
               SELECT COUNT(*)::int
               FROM "AmenityWaitlistEntry" ahead
               WHERE ahead."societyId"=w."societyId"
                 AND ahead."amenityId"=w."amenityId"
                 AND ahead."startsAt"=w."startsAt"
                 AND ahead."endsAt"=w."endsAt"
                 AND ahead."status"='WAITING'
                 AND (ahead."joinedAt",ahead."id") <= (w."joinedAt",w."id")
             ) ELSE NULL END AS "position"
      FROM "AmenityWaitlistEntry" w
      JOIN "Amenity" a ON a."id"=w."amenityId" AND a."societyId"=w."societyId"
      WHERE w."societyId"=${societyId}::uuid
        AND w."userId"=${userId}::uuid
        AND w."unitId"=${unitId}::uuid
      ORDER BY CASE WHEN w."status"='WAITING' THEN 0 ELSE 1 END, w."startsAt", w."joinedAt"
    `;
  }

  async joinWaitlist(
    societyId: string,
    userId: string,
    amenityId: string,
    input: { unitId: string; startsAt: string; endsAt: string },
  ) {
    await this.assertUnitAccess(societyId, userId, input.unitId);
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || startsAt >= endsAt) {
      throw new BadRequestException('A valid waitlist window is required');
    }
    const now = Date.now();
    if (startsAt.getTime() <= now) throw new BadRequestException('Amenity waitlist entries must start in the future');

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${societyId}:${amenityId}`}))`;
      const amenities = await tx.$queryRaw<AmenityRow[]>`
        SELECT "id","societyId","code","name","description","location","schedule","bookingRules",
               "feePaise","currency","requiresApproval","slotMinutes","maxConcurrentBookings","active"
        FROM "Amenity"
        WHERE "id"=${amenityId}::uuid AND "societyId"=${societyId}::uuid AND "active"=true
        LIMIT 1
      `;
      const amenity=amenities[0];
      if(!amenity) throw new NotFoundException('Amenity not found');
      if((endsAt.getTime()-startsAt.getTime())/60000!==amenity.slotMinutes){
        throw new BadRequestException(`Waitlist duration must be exactly ${amenity.slotMinutes} minutes`);
      }
      const rules=this.parseBookingRules(amenity.bookingRules);
      const minutesUntilStart=(startsAt.getTime()-now)/60000;
      if(rules.minAdvanceMinutes!==undefined&&minutesUntilStart<rules.minAdvanceMinutes){
        throw new BadRequestException(`Amenity must be joined at least ${rules.minAdvanceMinutes} minutes in advance`);
      }
      if(rules.maxAdvanceDays!==undefined&&minutesUntilStart>rules.maxAdvanceDays*24*60){
        throw new BadRequestException(`Amenity cannot be joined more than ${rules.maxAdvanceDays} days in advance`);
      }

      const ownActive=await tx.$queryRaw<CountRow[]>`
        SELECT COUNT(*)::int AS "count"
        FROM "AmenityBooking"
        WHERE "societyId"=${societyId}::uuid
          AND "amenityId"=${amenityId}::uuid
          AND "unitId"=${input.unitId}::uuid
          AND "status" IN ('PENDING','CONFIRMED','CHECKED_IN')
          AND "startsAt"<${endsAt} AND "endsAt">${startsAt}
      `;
      if(Number(ownActive[0]?.count??0)>0) throw new ConflictException('This unit already has an active booking in that amenity window');

      const overlaps=await tx.$queryRaw<CountRow[]>`
        SELECT COUNT(*)::int AS "count"
        FROM "AmenityBooking"
        WHERE "societyId"=${societyId}::uuid
          AND "amenityId"=${amenityId}::uuid
          AND "status" IN ('PENDING','CONFIRMED','CHECKED_IN')
          AND "startsAt"<${endsAt} AND "endsAt">${startsAt}
      `;
      if(Number(overlaps[0]?.count??0)<amenity.maxConcurrentBookings){
        throw new ConflictException('Amenity slot is currently available; book it directly');
      }

      try {
        const rows=await tx.$queryRaw<Array<Record<string,unknown>>>`
          INSERT INTO "AmenityWaitlistEntry" ("societyId","amenityId","unitId","userId","startsAt","endsAt")
          VALUES (${societyId}::uuid,${amenityId}::uuid,${input.unitId}::uuid,${userId}::uuid,${startsAt},${endsAt})
          RETURNING *
        `;
        const entry=rows[0];
        const positions=await tx.$queryRaw<Array<{position:number}>>`
          SELECT COUNT(*)::int AS "position"
          FROM "AmenityWaitlistEntry"
          WHERE "societyId"=${societyId}::uuid
            AND "amenityId"=${amenityId}::uuid
            AND "startsAt"=${startsAt}
            AND "endsAt"=${endsAt}
            AND "status"='WAITING'
            AND ("joinedAt","id") <= (${entry?.joinedAt}::timestamptz,${entry?.id}::uuid)
        `;
        return {...entry,position:Number(positions[0]?.position??1)};
      } catch(error) {
        if(this.isUniqueViolation(error)) throw new ConflictException('This unit is already on the waitlist for that amenity window');
        throw error;
      }
    });
  }

  async cancelWaitlistMine(societyId:string,userId:string,entryId:string) {
    const rows=await this.prisma.$queryRaw`
      UPDATE "AmenityWaitlistEntry"
      SET "status"='CANCELLED',"cancelledAt"=CURRENT_TIMESTAMP
      WHERE "id"=${entryId}::uuid
        AND "societyId"=${societyId}::uuid
        AND "userId"=${userId}::uuid
        AND "status"='WAITING'
      RETURNING *
    `;
    const entry=Array.isArray(rows)?rows[0]:undefined;
    if(!entry) throw new NotFoundException('Active amenity waitlist entry not found');
    return entry;
  }

  async cancelMine(societyId: string, userId: string, bookingId: string) {
    return this.prisma.$transaction(async (tx) => {
      const activeRows = await tx.$queryRaw<Array<{ amenityId:string; startsAt: Date; endsAt:Date; bookingRules: unknown }>>`
        SELECT b."amenityId", b."startsAt", b."endsAt", a."bookingRules"
        FROM "AmenityBooking" b
        JOIN "Amenity" a ON a."id" = b."amenityId" AND a."societyId" = b."societyId"
        WHERE b."id" = ${bookingId}::uuid
          AND b."societyId" = ${societyId}::uuid
          AND b."userId" = ${userId}::uuid
          AND b."status" IN ('PENDING', 'CONFIRMED')
        FOR UPDATE OF b
      `;
      const active = activeRows[0];
      if (!active) throw new NotFoundException('Active amenity booking not found');

      const rules = this.parseBookingRules(active.bookingRules);
      if (
        rules.cancellationCutoffMinutes !== undefined
        && active.startsAt.getTime() - Date.now() < rules.cancellationCutoffMinutes * 60000
      ) {
        throw new ConflictException(`Booking cannot be cancelled within ${rules.cancellationCutoffMinutes} minutes of start time`);
      }

      const rows = await tx.$queryRaw`
        UPDATE "AmenityBooking"
        SET "status" = 'CANCELLED', "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${bookingId}::uuid
          AND "societyId" = ${societyId}::uuid
          AND "userId" = ${userId}::uuid
          AND "status" IN ('PENDING', 'CONFIRMED')
        RETURNING *
      `;
      const booking = Array.isArray(rows) ? rows[0] : undefined;
      if (!booking) throw new ConflictException('Booking changed; refresh and retry');
      await this.promoteNextWaitlist(tx,societyId,active.amenityId,active.startsAt,active.endsAt);
      return booking;
    });
  }

  async revoke(societyId: string, reviewerUserId: string, bookingId: string, reason: string) {
    const note = reason.trim();
    if (!note) throw new BadRequestException('Revocation reason is required');
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; amenityId:string; startsAt:Date; endsAt:Date }>>`
        UPDATE "AmenityBooking"
        SET "status"='CANCELLED',
            "reviewedByUserId"=${reviewerUserId}::uuid,
            "reviewNote"=${`Revoked: ${note}`},
            "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${bookingId}::uuid
          AND "societyId"=${societyId}::uuid
          AND "status" IN ('PENDING','CONFIRMED')
        RETURNING "id","amenityId","startsAt","endsAt"
      `;
      const released=rows[0];
      if (!released) throw new ConflictException('Active amenity booking is missing or already closed');
      await this.promoteNextWaitlist(tx,societyId,released.amenityId,released.startsAt,released.endsAt);
      const booking = await tx.$queryRaw`
        SELECT * FROM "AmenityBooking"
        WHERE "id"=${bookingId}::uuid AND "societyId"=${societyId}::uuid
        LIMIT 1
      `;
      return Array.isArray(booking) ? booking[0] : booking;
    });
  }

  async checkIn(societyId: string, actorUserId: string, bookingId: string, note?: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ startsAt: Date; endsAt: Date; status: string; bookingRules: unknown }>>`
        SELECT b."startsAt", b."endsAt", b."status"::text AS "status", a."bookingRules"
        FROM "AmenityBooking" b
        JOIN "Amenity" a ON a."id"=b."amenityId" AND a."societyId"=b."societyId"
        WHERE b."id"=${bookingId}::uuid AND b."societyId"=${societyId}::uuid
        FOR UPDATE OF b
      `;
      const booking = rows[0];
      if (!booking) throw new NotFoundException('Amenity booking not found');
      if (booking.status !== 'CONFIRMED') throw new ConflictException('Only confirmed amenity bookings can check in');
      const rules = this.parseBookingRules(booking.bookingRules);
      const opensAt = booking.startsAt.getTime() - (rules.checkInOpenMinutesBefore ?? 15) * 60000;
      const now = Date.now();
      if (now < opensAt) throw new ConflictException('Amenity check-in is not open yet');
      if (now >= booking.endsAt.getTime()) throw new ConflictException('Amenity booking window has already ended');

      const updated = await tx.$queryRaw`
        UPDATE "AmenityBooking"
        SET "status"='CHECKED_IN',
            "checkedInAt"=CURRENT_TIMESTAMP,
            "attendanceByUserId"=${actorUserId}::uuid,
            "attendanceNote"=${note?.trim() || null},
            "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${bookingId}::uuid AND "societyId"=${societyId}::uuid AND "status"='CONFIRMED'
        RETURNING *
      `;
      const result = Array.isArray(updated) ? updated[0] : updated;
      if (!result) throw new ConflictException('Amenity booking changed; refresh and retry');
      return result;
    });
  }

  async complete(societyId: string, actorUserId: string, bookingId: string, note?: string) {
    const rows = await this.prisma.$queryRaw`
      UPDATE "AmenityBooking"
      SET "status"='COMPLETED',
          "completedAt"=CURRENT_TIMESTAMP,
          "attendanceByUserId"=${actorUserId}::uuid,
          "attendanceNote"=COALESCE(${note?.trim() || null}, "attendanceNote"),
          "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${bookingId}::uuid
        AND "societyId"=${societyId}::uuid
        AND "status"='CHECKED_IN'
      RETURNING *
    `;
    const booking = Array.isArray(rows) ? rows[0] : undefined;
    if (!booking) throw new ConflictException('Only checked-in amenity bookings can be completed');
    return booking;
  }

  async markNoShow(societyId: string, actorUserId: string, bookingId: string, note?: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ startsAt: Date; status: string; bookingRules: unknown }>>`
        SELECT b."startsAt", b."status"::text AS "status", a."bookingRules"
        FROM "AmenityBooking" b
        JOIN "Amenity" a ON a."id"=b."amenityId" AND a."societyId"=b."societyId"
        WHERE b."id"=${bookingId}::uuid AND b."societyId"=${societyId}::uuid
        FOR UPDATE OF b
      `;
      const booking = rows[0];
      if (!booking) throw new NotFoundException('Amenity booking not found');
      if (booking.status !== 'CONFIRMED') throw new ConflictException('Only confirmed amenity bookings can be marked no-show');
      const rules = this.parseBookingRules(booking.bookingRules);
      const eligibleAt = booking.startsAt.getTime() + (rules.noShowGraceMinutes ?? 15) * 60000;
      if (Date.now() < eligibleAt) throw new ConflictException('No-show grace period has not elapsed');

      const updated = await tx.$queryRaw`
        UPDATE "AmenityBooking"
        SET "status"='NO_SHOW',
            "noShowAt"=CURRENT_TIMESTAMP,
            "attendanceByUserId"=${actorUserId}::uuid,
            "attendanceNote"=${note?.trim() || null},
            "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${bookingId}::uuid AND "societyId"=${societyId}::uuid AND "status"='CONFIRMED'
        RETURNING *
      `;
      const result = Array.isArray(updated) ? updated[0] : updated;
      if (!result) throw new ConflictException('Amenity booking changed; refresh and retry');
      return result;
    });
  }

  async listManage(societyId: string) {
    return this.prisma.$queryRaw<AmenityRow[]>`
      SELECT "id", "societyId", "code", "name", "description", "location", "schedule",
             "bookingRules", "feePaise", "currency", "requiresApproval", "slotMinutes",
             "maxConcurrentBookings", "active"
      FROM "Amenity"
      WHERE "societyId" = ${societyId}::uuid
      ORDER BY "active" DESC, "name" ASC
    `;
  }

  async createAmenity(
    societyId: string,
    input: {
      code: string;
      name: string;
      description?: string;
      location?: string;
      schedule?: Record<string, unknown>;
      bookingRules?: Record<string, unknown>;
      feePaise?: number;
      requiresApproval?: boolean;
      slotMinutes?: number;
      maxConcurrentBookings?: number;
    },
  ) {
    this.parseBookingRules(input.bookingRules ?? {});
    try {
      const rows = await this.prisma.$queryRaw`
        INSERT INTO "Amenity" (
          "societyId", "code", "name", "description", "location", "schedule", "bookingRules",
          "feePaise", "currency", "requiresApproval", "slotMinutes", "maxConcurrentBookings"
        ) VALUES (
          ${societyId}::uuid, ${input.code.trim().toUpperCase()}, ${input.name.trim()},
          ${input.description?.trim() || null}, ${input.location?.trim() || null},
          ${JSON.stringify(input.schedule ?? {})}::jsonb, ${JSON.stringify(input.bookingRules ?? {})}::jsonb,
          ${input.feePaise ?? 0}, 'INR', ${input.requiresApproval ?? false},
          ${input.slotMinutes ?? 60}, ${input.maxConcurrentBookings ?? 1}
        ) RETURNING *
      `;
      return Array.isArray(rows) ? rows[0] : rows;
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new ConflictException('Amenity code already exists in this society');
      throw error;
    }
  }

  async updateAmenity(societyId: string, amenityId: string, input: AmenityUpdateInput) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${societyId}:${amenityId}`}))`;
      const existingRows = await tx.$queryRaw<AmenityRow[]>`
        SELECT "id", "societyId", "code", "name", "description", "location", "schedule",
               "bookingRules", "feePaise", "currency", "requiresApproval", "slotMinutes",
               "maxConcurrentBookings", "active"
        FROM "Amenity"
        WHERE "id" = ${amenityId}::uuid AND "societyId" = ${societyId}::uuid
        LIMIT 1
      `;
      const existing = existingRows[0];
      if (!existing) throw new NotFoundException('Amenity not found');
      this.parseBookingRules(input.bookingRules ?? existing.bookingRules);

      const structuralChange = existing.slotMinutes !== input.slotMinutes || existing.maxConcurrentBookings !== input.maxConcurrentBookings;
      if (structuralChange) {
        const futureRows = await tx.$queryRaw<CountRow[]>`
          SELECT COUNT(*)::int AS "count"
          FROM "AmenityBooking"
          WHERE "societyId" = ${societyId}::uuid
            AND "amenityId" = ${amenityId}::uuid
            AND "status" IN ('PENDING', 'CONFIRMED', 'CHECKED_IN')
            AND "endsAt" > CURRENT_TIMESTAMP
        `;
        if (Number(futureRows[0]?.count ?? 0) > 0) {
          throw new ConflictException('Slot duration or capacity cannot change while future active bookings exist');
        }
      }

      const rows = await tx.$queryRaw<AmenityRow[]>`
        UPDATE "Amenity"
        SET "name" = ${input.name.trim()},
            "description" = ${input.description?.trim() || null},
            "location" = ${input.location?.trim() || null},
            "schedule" = ${JSON.stringify(input.schedule ?? existing.schedule ?? {})}::jsonb,
            "bookingRules" = ${JSON.stringify(input.bookingRules ?? existing.bookingRules ?? {})}::jsonb,
            "feePaise" = ${input.feePaise},
            "requiresApproval" = ${input.requiresApproval},
            "slotMinutes" = ${input.slotMinutes},
            "maxConcurrentBookings" = ${input.maxConcurrentBookings},
            "active" = ${input.active},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${amenityId}::uuid AND "societyId" = ${societyId}::uuid
        RETURNING "id", "societyId", "code", "name", "description", "location", "schedule",
                  "bookingRules", "feePaise", "currency", "requiresApproval", "slotMinutes",
                  "maxConcurrentBookings", "active"
      `;
      return rows[0];
    });
  }

  async listBookingsManage(societyId: string, status?: string) {
    return this.prisma.$queryRaw`
      SELECT b.*, a."name" AS "amenityName", a."code" AS "amenityCode",
             u."number" AS "unitNumber", bd."name" AS "buildingName"
      FROM "AmenityBooking" b
      JOIN "Amenity" a ON a."id" = b."amenityId" AND a."societyId" = b."societyId"
      JOIN "Unit" u ON u."id" = b."unitId" AND u."societyId" = b."societyId"
      JOIN "Building" bd ON bd."id" = u."buildingId" AND bd."societyId" = b."societyId"
      WHERE b."societyId" = ${societyId}::uuid
        AND (${status ?? null}::text IS NULL OR b."status"::text = ${status ?? null})
      ORDER BY b."startsAt" ASC
    `;
  }

  approve(societyId: string, reviewerUserId: string, bookingId: string, note?: string) {
    return this.review(societyId, reviewerUserId, bookingId, 'CONFIRMED', note);
  }

  reject(societyId: string, reviewerUserId: string, bookingId: string, note?: string) {
    return this.review(societyId, reviewerUserId, bookingId, 'REJECTED', note);
  }

  private async review(
    societyId: string,
    reviewerUserId: string,
    bookingId: string,
    nextStatus: 'CONFIRMED' | 'REJECTED',
    note?: string,
  ) {
    return this.prisma.$transaction(async(tx)=>{
      const rows = await tx.$queryRaw<Array<Record<string,unknown>&{amenityId:string;startsAt:Date;endsAt:Date}>>`
        UPDATE "AmenityBooking"
        SET "status" = ${nextStatus}::"AmenityBookingStatus",
            "reviewedByUserId" = ${reviewerUserId}::uuid,
            "reviewNote" = ${note?.trim() || null},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${bookingId}::uuid
          AND "societyId" = ${societyId}::uuid
          AND "status" = 'PENDING'
        RETURNING *
      `;
      const booking=rows[0];
      if(!booking) throw new NotFoundException('Pending amenity booking not found');
      if(nextStatus==='REJECTED') await this.promoteNextWaitlist(tx,societyId,booking.amenityId,booking.startsAt,booking.endsAt);
      return booking;
    });
  }

  private async promoteNextWaitlist(
    tx:Prisma.TransactionClient,
    societyId:string,
    amenityId:string,
    startsAt:Date,
    endsAt:Date,
  ) {
    if(startsAt.getTime()<=Date.now()) return null;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${societyId}:${amenityId}`}))`;
    const amenities=await tx.$queryRaw<AmenityRow[]>`
      SELECT "id","societyId","code","name","description","location","schedule","bookingRules",
             "feePaise","currency","requiresApproval","slotMinutes","maxConcurrentBookings","active"
      FROM "Amenity"
      WHERE "id"=${amenityId}::uuid AND "societyId"=${societyId}::uuid AND "active"=true
      LIMIT 1
    `;
    const amenity=amenities[0];
    if(!amenity) return null;
    const overlaps=await tx.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::int AS "count"
      FROM "AmenityBooking"
      WHERE "societyId"=${societyId}::uuid
        AND "amenityId"=${amenityId}::uuid
        AND "status" IN ('PENDING','CONFIRMED','CHECKED_IN')
        AND "startsAt"<${endsAt} AND "endsAt">${startsAt}
    `;
    if(Number(overlaps[0]?.count??0)>=amenity.maxConcurrentBookings) return null;

    const waiters=await tx.$queryRaw<Array<{id:string;unitId:string;userId:string;startsAt:Date;endsAt:Date}>>`
      SELECT w."id",w."unitId",w."userId",w."startsAt",w."endsAt"
      FROM "AmenityWaitlistEntry" w
      WHERE w."societyId"=${societyId}::uuid
        AND w."amenityId"=${amenityId}::uuid
        AND w."startsAt"=${startsAt}
        AND w."endsAt"=${endsAt}
        AND w."status"='WAITING'
        AND EXISTS (
          SELECT 1 FROM "Unit" u
          WHERE u."id"=w."unitId" AND u."societyId"=w."societyId"
            AND (
              EXISTS (
                SELECT 1 FROM "UnitOccupancy" o
                WHERE o."societyId"=w."societyId" AND o."unitId"=w."unitId" AND o."userId"=w."userId"
                  AND o."active"=true AND o."effectiveFrom"<=CURRENT_TIMESTAMP
                  AND (o."effectiveTo" IS NULL OR o."effectiveTo">CURRENT_TIMESTAMP)
              )
              OR EXISTS (
                SELECT 1 FROM "UnitOwnership" ow
                WHERE ow."societyId"=w."societyId" AND ow."unitId"=w."unitId" AND ow."userId"=w."userId"
                  AND ow."active"=true AND ow."verified"=true AND ow."effectiveFrom"<=CURRENT_TIMESTAMP
                  AND (ow."effectiveTo" IS NULL OR ow."effectiveTo">CURRENT_TIMESTAMP)
              )
            )
        )
        AND NOT EXISTS (
          SELECT 1 FROM "AmenityBooking" b
          WHERE b."societyId"=w."societyId"
            AND b."amenityId"=w."amenityId"
            AND b."unitId"=w."unitId"
            AND b."status" IN ('PENDING','CONFIRMED','CHECKED_IN')
            AND b."startsAt"<w."endsAt" AND b."endsAt">w."startsAt"
        )
      ORDER BY w."joinedAt",w."id"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;
    const waiter=waiters[0];
    if(!waiter) return null;
    const status=amenity.requiresApproval?'PENDING':'CONFIRMED';
    const bookings=await tx.$queryRaw<Array<{id:string}>>`
      INSERT INTO "AmenityBooking" (
        "societyId","amenityId","unitId","userId","startsAt","endsAt","status","feePaise","currency"
      ) VALUES (
        ${societyId}::uuid,${amenityId}::uuid,${waiter.unitId}::uuid,${waiter.userId}::uuid,
        ${waiter.startsAt},${waiter.endsAt},${status}::"AmenityBookingStatus",${amenity.feePaise},${amenity.currency}
      )
      RETURNING "id"
    `;
    const promotedBooking=bookings[0];
    if(!promotedBooking) return null;
    await tx.$queryRaw`
      UPDATE "AmenityWaitlistEntry"
      SET "status"='PROMOTED',"promotedAt"=CURRENT_TIMESTAMP,"promotedBookingId"=${promotedBooking.id}::uuid
      WHERE "id"=${waiter.id}::uuid AND "societyId"=${societyId}::uuid AND "status"='WAITING'
    `;
    return {entryId:waiter.id,bookingId:promotedBooking.id,status};
  }

  private parseBookingRules(value: unknown): AmenityBookingRules {
    if (value === null || value === undefined) return {};
    if (typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Amenity booking rules must be an object');
    const source = value as Record<string, unknown>;
    return {
      minAdvanceMinutes: this.optionalPolicyInteger(source.minAdvanceMinutes, 'minAdvanceMinutes', 0),
      maxAdvanceDays: this.optionalPolicyInteger(source.maxAdvanceDays, 'maxAdvanceDays', 1),
      maxFutureBookingsPerUnit: this.optionalPolicyInteger(source.maxFutureBookingsPerUnit, 'maxFutureBookingsPerUnit', 1),
      cancellationCutoffMinutes: this.optionalPolicyInteger(source.cancellationCutoffMinutes, 'cancellationCutoffMinutes', 0),
      checkInOpenMinutesBefore: this.optionalPolicyInteger(source.checkInOpenMinutesBefore, 'checkInOpenMinutesBefore', 0),
      noShowGraceMinutes: this.optionalPolicyInteger(source.noShowGraceMinutes, 'noShowGraceMinutes', 0),
    };
  }

  private optionalPolicyInteger(value: unknown, field: string, minimum: number) {
    if (value === undefined || value === null) return undefined;
    if (!Number.isInteger(value) || (value as number) < minimum) {
      throw new BadRequestException(`${field} must be an integer greater than or equal to ${minimum}`);
    }
    return value as number;
  }

  private async assertUnitAccess(societyId: string, userId: string, unitId: string) {
    const rows = await this.prisma.$queryRaw<{ allowed: boolean }[]>`
      SELECT true AS "allowed"
      FROM "Unit" u
      WHERE u."id" = ${unitId}::uuid
        AND u."societyId" = ${societyId}::uuid
        AND (
          EXISTS (
            SELECT 1 FROM "UnitOccupancy" o
            WHERE o."societyId" = ${societyId}::uuid AND o."unitId" = u."id" AND o."userId" = ${userId}::uuid
              AND o."active" = true AND o."effectiveFrom" <= CURRENT_TIMESTAMP
              AND (o."effectiveTo" IS NULL OR o."effectiveTo" > CURRENT_TIMESTAMP)
          )
          OR EXISTS (
            SELECT 1 FROM "UnitOwnership" ow
            WHERE ow."societyId" = ${societyId}::uuid AND ow."unitId" = u."id" AND ow."userId" = ${userId}::uuid
              AND ow."active" = true AND ow."verified" = true AND ow."effectiveFrom" <= CURRENT_TIMESTAMP
              AND (ow."effectiveTo" IS NULL OR ow."effectiveTo" > CURRENT_TIMESTAMP)
          )
        )
      LIMIT 1
    `;
    if (!rows[0]?.allowed) throw new ForbiddenException('Unit is outside the current resident property context');
  }

  private isUniqueViolation(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const candidate = error as { code?: string; meta?: { code?: string } };
    return candidate.code === '23505' || candidate.code === 'P2002' || candidate.meta?.code === '23505';
  }
}
