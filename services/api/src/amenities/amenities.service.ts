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

type AmenityPricingBand = {
  label?: string;
  daysOfWeek: number[];
  startMinute: number;
  endMinute: number;
  feePaise: number;
};

type AmenityBookingRules = {
  minAdvanceMinutes?: number;
  maxAdvanceDays?: number;
  maxFutureBookingsPerUnit?: number;
  maxBookingsPerDayPerUnit?: number;
  cooldownMinutes?: number;
  cancellationCutoffMinutes?: number;
  checkInOpenMinutesBefore?: number;
  noShowGraceMinutes?: number;
  maxGuestsPerBooking?: number;
  conflictGroup?: string;
  pricingBands?: AmenityPricingBand[];
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
    input: { unitId: string; startsAt: string; endsAt: string; idempotencyKey?: string; guestCount?: number },
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
    const guestCount = input.guestCount ?? 0;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${societyId}:${amenityId}`}))`;

      if (idempotencyKey) {
        const existing = await tx.$queryRaw<Array<{ id: string; amenityId: string; unitId: string; startsAt: Date; endsAt: Date; guestCount:number }>>`
          SELECT "id","amenityId","unitId","startsAt","endsAt","guestCount"
          FROM "AmenityBooking"
          WHERE "societyId"=${societyId}::uuid AND "userId"=${userId}::uuid
            AND "idempotencyKey"=${idempotencyKey}
          LIMIT 1
        `;
        if (existing[0]) {
          const samePayload = existing[0].amenityId === amenityId
            && existing[0].unitId === input.unitId
            && existing[0].startsAt.getTime() === startsAt.getTime()
            && existing[0].endsAt.getTime() === endsAt.getTime()
            && Number(existing[0].guestCount ?? 0) === guestCount;
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
      this.validateGuestCount(rules, guestCount);
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

      if (rules.maxBookingsPerDayPerUnit !== undefined) {
        const dailyRows = await tx.$queryRaw<CountRow[]>`
          SELECT COUNT(*)::int AS "count"
          FROM "AmenityBooking"
          WHERE "societyId" = ${societyId}::uuid
            AND "amenityId" = ${amenityId}::uuid
            AND "unitId" = ${input.unitId}::uuid
            AND "status" IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED')
            AND ("startsAt" AT TIME ZONE 'Asia/Kolkata')::date = (${startsAt} AT TIME ZONE 'Asia/Kolkata')::date
        `;
        if (Number(dailyRows[0]?.count ?? 0) >= rules.maxBookingsPerDayPerUnit) {
          throw new ConflictException('Unit has reached the daily booking limit for this amenity');
        }
      }

      if ((rules.cooldownMinutes ?? 0) > 0) {
        const cooldownRows = await tx.$queryRaw<CountRow[]>`
          SELECT COUNT(*)::int AS "count"
          FROM "AmenityBooking"
          WHERE "societyId" = ${societyId}::uuid
            AND "amenityId" = ${amenityId}::uuid
            AND "unitId" = ${input.unitId}::uuid
            AND "status" IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED')
            AND "startsAt" < ${endsAt} + (${rules.cooldownMinutes} * INTERVAL '1 minute')
            AND "endsAt" > ${startsAt} - (${rules.cooldownMinutes} * INTERVAL '1 minute')
        `;
        if (Number(cooldownRows[0]?.count ?? 0) > 0) {
          throw new ConflictException(`Unit must keep at least ${rules.cooldownMinutes} minutes between bookings for this amenity`);
        }
      }

      if (rules.conflictGroup) {
        const groupedConflicts = await tx.$queryRaw<CountRow[]>`
          SELECT COUNT(*)::int AS "count"
          FROM "AmenityBooking" b
          JOIN "Amenity" a ON a."id"=b."amenityId" AND a."societyId"=b."societyId"
          WHERE b."societyId"=${societyId}::uuid
            AND b."unitId"=${input.unitId}::uuid
            AND b."amenityId"<>${amenityId}::uuid
            AND b."status" IN ('PENDING','CONFIRMED','CHECKED_IN')
            AND LOWER(TRIM(COALESCE(a."bookingRules"->>'conflictGroup','')))=LOWER(TRIM(${rules.conflictGroup}))
            AND b."startsAt"<${endsAt}
            AND b."endsAt">${startsAt}
        `;
        if (Number(groupedConflicts[0]?.count ?? 0) > 0) {
          throw new ConflictException(`Unit already has an overlapping booking in amenity conflict group ${rules.conflictGroup}`);
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
      const bookingFeePaise = this.resolveBookingFee(amenity.feePaise, rules, startsAt);
      const rows = await tx.$queryRaw`
        INSERT INTO "AmenityBooking" (
          "societyId", "amenityId", "unitId", "userId", "startsAt", "endsAt",
          "status", "feePaise", "currency", "guestCount", "idempotencyKey"
        ) VALUES (
          ${societyId}::uuid, ${amenityId}::uuid, ${input.unitId}::uuid, ${userId}::uuid,
          ${startsAt}, ${endsAt}, ${status}::"AmenityBookingStatus", ${bookingFeePaise}, ${amenity.currency},
          ${guestCount}, ${idempotencyKey}
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
    input: { unitId: string; startsAt: string; endsAt: string; guestCount?: number },
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
      const guestCount=input.guestCount??0;
      this.validateGuestCount(rules,guestCount);
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

      if(rules.conflictGroup){
        const groupedConflicts=await tx.$queryRaw<CountRow[]>`
          SELECT COUNT(*)::int AS "count"
          FROM "AmenityBooking" b
          JOIN "Amenity" a ON a."id"=b."amenityId" AND a."societyId"=b."societyId"
          WHERE b."societyId"=${societyId}::uuid
            AND b."unitId"=${input.unitId}::uuid
            AND b."amenityId"<>${amenityId}::uuid
            AND b."status" IN ('PENDING','CONFIRMED','CHECKED_IN')
            AND LOWER(TRIM(COALESCE(a."bookingRules"->>'conflictGroup','')))=LOWER(TRIM(${rules.conflictGroup}))
            AND b."startsAt"<${endsAt} AND b."endsAt">${startsAt}
        `;
        if(Number(groupedConflicts[0]?.count??0)>0){
          throw new ConflictException(`Unit already has an overlapping booking in amenity conflict group ${rules.conflictGroup}`);
        }
      }

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
          INSERT INTO "AmenityWaitlistEntry" ("societyId","amenityId","unitId","userId","startsAt","endsAt","guestCount")
          VALUES (${societyId}::uuid,${amenityId}::uuid,${input.unitId}::uuid,${userId}::uuid,${startsAt},${endsAt},${guestCount})
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

  async analytics(societyId:string) {
    const [summaryRows,demandRows]=await Promise.all([
      this.prisma.$queryRaw<Array<{
        bookingCount:number;completedCount:number;checkedInCount:number;noShowCount:number;
        cancelledCount:number;rejectedCount:number;waitingCount:number;promotedCount:number;
      }>>`
        SELECT
          COUNT(b."id")::int AS "bookingCount",
          COUNT(b."id") FILTER (WHERE b."status"='COMPLETED')::int AS "completedCount",
          COUNT(b."id") FILTER (WHERE b."status"='CHECKED_IN')::int AS "checkedInCount",
          COUNT(b."id") FILTER (WHERE b."status"='NO_SHOW')::int AS "noShowCount",
          COUNT(b."id") FILTER (WHERE b."status"='CANCELLED')::int AS "cancelledCount",
          COUNT(b."id") FILTER (WHERE b."status"='REJECTED')::int AS "rejectedCount",
          (SELECT COUNT(*)::int FROM "AmenityWaitlistEntry" w
             WHERE w."societyId"=${societyId}::uuid AND w."joinedAt">=CURRENT_TIMESTAMP-INTERVAL '30 days'
               AND w."status"='WAITING') AS "waitingCount",
          (SELECT COUNT(*)::int FROM "AmenityWaitlistEntry" w
             WHERE w."societyId"=${societyId}::uuid AND w."promotedAt">=CURRENT_TIMESTAMP-INTERVAL '30 days'
               AND w."status"='PROMOTED') AS "promotedCount"
        FROM "AmenityBooking" b
        WHERE b."societyId"=${societyId}::uuid
          AND b."createdAt">=CURRENT_TIMESTAMP-INTERVAL '30 days'
      `,
      this.prisma.$queryRaw<Array<{
        amenityId:string;amenityName:string;bookingCount:number;waitlistJoinCount:number;noShowCount:number;
      }>>`
        SELECT a."id" AS "amenityId",a."name" AS "amenityName",
               COUNT(DISTINCT b."id")::int AS "bookingCount",
               COUNT(DISTINCT w."id")::int AS "waitlistJoinCount",
               COUNT(DISTINCT b."id") FILTER (WHERE b."status"='NO_SHOW')::int AS "noShowCount"
        FROM "Amenity" a
        LEFT JOIN "AmenityBooking" b ON b."amenityId"=a."id" AND b."societyId"=a."societyId"
          AND b."createdAt">=CURRENT_TIMESTAMP-INTERVAL '30 days'
        LEFT JOIN "AmenityWaitlistEntry" w ON w."amenityId"=a."id" AND w."societyId"=a."societyId"
          AND w."joinedAt">=CURRENT_TIMESTAMP-INTERVAL '30 days'
        WHERE a."societyId"=${societyId}::uuid
        GROUP BY a."id",a."name"
        HAVING COUNT(DISTINCT b."id")>0 OR COUNT(DISTINCT w."id")>0
        ORDER BY (COUNT(DISTINCT b."id")+COUNT(DISTINCT w."id")) DESC,a."name"
        LIMIT 8
      `,
    ]);
    const summary=summaryRows[0]??{
      bookingCount:0,completedCount:0,checkedInCount:0,noShowCount:0,
      cancelledCount:0,rejectedCount:0,waitingCount:0,promotedCount:0,
    };
    const attendanceEligible=summary.completedCount+summary.noShowCount;
    const attendanceRatePct=attendanceEligible===0?0:Math.round(summary.completedCount*1000/attendanceEligible)/10;
    const cancellationRatePct=summary.bookingCount===0?0:Math.round(summary.cancelledCount*1000/summary.bookingCount)/10;
    const noShowRatePct=attendanceEligible===0?0:Math.round(summary.noShowCount*1000/attendanceEligible)/10;
    const waitlistTracked=summary.waitingCount+summary.promotedCount;
    const waitlistPromotionRatePct=waitlistTracked===0?0:Math.round(summary.promotedCount*1000/waitlistTracked)/10;
    const demandTotal=demandRows.reduce((sum,row)=>sum+row.bookingCount+row.waitlistJoinCount,0);
    return {
      periodDays:30,
      summary:{
        ...summary,
        attendanceEligibleCount:attendanceEligible,
        attendanceRatePct,
        cancellationRatePct,
        noShowRatePct,
        waitlistPromotionRatePct,
      },
      demand:demandRows.map((row,index)=>{
        const demandSignals=row.bookingCount+row.waitlistJoinCount;
        return {
          ...row,
          demandSignals,
          demandRank:index+1,
          demandSharePct:demandTotal===0?0:Math.round(demandSignals*1000/demandTotal)/10,
        };
      }),
      generatedAt:new Date().toISOString(),
      predictive:false,
    };
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
      const existingRules=this.parseBookingRules(existing.bookingRules);
      const nextRules=this.parseBookingRules(input.bookingRules ?? existing.bookingRules);

      const nextGuestLimit=nextRules.maxGuestsPerBooking??0;
      const existingGuestLimit=existingRules.maxGuestsPerBooking??0;
      if(nextGuestLimit<existingGuestLimit){
        const guestRows=await tx.$queryRaw<Array<{maxGuestCount:number}>>`
          SELECT GREATEST(
            COALESCE((SELECT MAX("guestCount") FROM "AmenityBooking"
              WHERE "societyId"=${societyId}::uuid AND "amenityId"=${amenityId}::uuid
                AND "status" IN ('PENDING','CONFIRMED','CHECKED_IN') AND "endsAt">CURRENT_TIMESTAMP),0),
            COALESCE((SELECT MAX("guestCount") FROM "AmenityWaitlistEntry"
              WHERE "societyId"=${societyId}::uuid AND "amenityId"=${amenityId}::uuid
                AND "status"='WAITING' AND "endsAt">CURRENT_TIMESTAMP),0)
          )::int AS "maxGuestCount"
        `;
        const futureGuestCount=Number(guestRows[0]?.maxGuestCount??0);
        if(futureGuestCount>nextGuestLimit){
          throw new ConflictException(`Guest limit cannot be reduced below ${futureGuestCount} while future bookings or waitlist entries require that allowance`);
        }
      }

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
    const rules=this.parseBookingRules(amenity.bookingRules);
    const overlaps=await tx.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::int AS "count"
      FROM "AmenityBooking"
      WHERE "societyId"=${societyId}::uuid
        AND "amenityId"=${amenityId}::uuid
        AND "status" IN ('PENDING','CONFIRMED','CHECKED_IN')
        AND "startsAt"<${endsAt} AND "endsAt">${startsAt}
    `;
    if(Number(overlaps[0]?.count??0)>=amenity.maxConcurrentBookings) return null;

    const waiters=await tx.$queryRaw<Array<{id:string;unitId:string;userId:string;startsAt:Date;endsAt:Date;guestCount:number}>>`
      SELECT w."id",w."unitId",w."userId",w."startsAt",w."endsAt",w."guestCount"
      FROM "AmenityWaitlistEntry" w
      WHERE w."societyId"=${societyId}::uuid
        AND w."amenityId"=${amenityId}::uuid
        AND w."startsAt"=${startsAt}
        AND w."endsAt"=${endsAt}
        AND w."status"='WAITING'
        AND w."guestCount" <= ${rules.maxGuestsPerBooking ?? 0}
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
        AND (
          ${rules.conflictGroup ?? null}::text IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM "AmenityBooking" gb
            JOIN "Amenity" ga ON ga."id"=gb."amenityId" AND ga."societyId"=gb."societyId"
            WHERE gb."societyId"=w."societyId"
              AND gb."unitId"=w."unitId"
              AND gb."amenityId"<>w."amenityId"
              AND gb."status" IN ('PENDING','CONFIRMED','CHECKED_IN')
              AND LOWER(TRIM(COALESCE(ga."bookingRules"->>'conflictGroup','')))=LOWER(TRIM(${rules.conflictGroup ?? ''}))
              AND gb."startsAt"<w."endsAt" AND gb."endsAt">w."startsAt"
          )
        )
      ORDER BY w."joinedAt",w."id"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;
    const waiter=waiters[0];
    if(!waiter) return null;
    const status=amenity.requiresApproval?'PENDING':'CONFIRMED';
    const bookingFeePaise=this.resolveBookingFee(amenity.feePaise,rules,waiter.startsAt);
    const bookings=await tx.$queryRaw<Array<{id:string}>>`
      INSERT INTO "AmenityBooking" (
        "societyId","amenityId","unitId","userId","startsAt","endsAt","status","feePaise","currency","guestCount"
      ) VALUES (
        ${societyId}::uuid,${amenityId}::uuid,${waiter.unitId}::uuid,${waiter.userId}::uuid,
        ${waiter.startsAt},${waiter.endsAt},${status}::"AmenityBookingStatus",${bookingFeePaise},${amenity.currency},${waiter.guestCount}
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
      maxBookingsPerDayPerUnit: this.optionalPolicyInteger(source.maxBookingsPerDayPerUnit, 'maxBookingsPerDayPerUnit', 1),
      cooldownMinutes: this.optionalPolicyInteger(source.cooldownMinutes, 'cooldownMinutes', 0),
      cancellationCutoffMinutes: this.optionalPolicyInteger(source.cancellationCutoffMinutes, 'cancellationCutoffMinutes', 0),
      checkInOpenMinutesBefore: this.optionalPolicyInteger(source.checkInOpenMinutesBefore, 'checkInOpenMinutesBefore', 0),
      noShowGraceMinutes: this.optionalPolicyInteger(source.noShowGraceMinutes, 'noShowGraceMinutes', 0),
      maxGuestsPerBooking: this.optionalPolicyInteger(source.maxGuestsPerBooking, 'maxGuestsPerBooking', 0, 50),
      conflictGroup: this.optionalConflictGroup(source.conflictGroup),
      pricingBands: this.parsePricingBands(source.pricingBands),
    };
  }

  private validateGuestCount(rules:AmenityBookingRules,guestCount:number){
    if(!Number.isInteger(guestCount)||guestCount<0||guestCount>50){
      throw new BadRequestException('guestCount must be an integer between 0 and 50');
    }
    const allowed=rules.maxGuestsPerBooking??0;
    if(guestCount>allowed){
      if(allowed===0) throw new BadRequestException('Guests are not enabled for this amenity');
      throw new BadRequestException(`This amenity allows at most ${allowed} guest${allowed===1?'':'s'} per booking`);
    }
  }

  private optionalConflictGroup(value:unknown){
    if(value===undefined||value===null||value==='') return undefined;
    if(typeof value!=='string') throw new BadRequestException('conflictGroup must be a string');
    const normalized=value.trim().toUpperCase();
    if(normalized.length<2||normalized.length>64||!/^[A-Z0-9_-]+$/.test(normalized)){
      throw new BadRequestException('conflictGroup must be 2-64 letters, numbers, underscores or hyphens');
    }
    return normalized;
  }

  private parsePricingBands(value:unknown):AmenityPricingBand[]|undefined{
    if(value===undefined||value===null) return undefined;
    if(!Array.isArray(value)||value.length>12) throw new BadRequestException('pricingBands must be an array of at most 12 time bands');
    const bands=value.map((item,index)=>{
      if(!item||typeof item!=='object'||Array.isArray(item)) throw new BadRequestException(`pricingBands[${index}] must be an object`);
      const source=item as Record<string,unknown>;
      const startMinute=this.optionalPolicyInteger(source.startMinute,`pricingBands[${index}].startMinute`,0);
      const endMinute=this.optionalPolicyInteger(source.endMinute,`pricingBands[${index}].endMinute`,1);
      const feePaise=this.optionalPolicyInteger(source.feePaise,`pricingBands[${index}].feePaise`,0);
      if(startMinute===undefined||endMinute===undefined||feePaise===undefined||startMinute>1439||endMinute>1440||endMinute<=startMinute){
        throw new BadRequestException(`pricingBands[${index}] requires 0-1439 startMinute, 1-1440 endMinute and end after start`);
      }
      const rawDays=source.daysOfWeek;
      if(rawDays!==undefined&&!Array.isArray(rawDays)) throw new BadRequestException(`pricingBands[${index}].daysOfWeek must be an array`);
      const days=(rawDays===undefined?[0,1,2,3,4,5,6]:rawDays as unknown[]).map(day=>{
        if(!Number.isInteger(day)||(day as number)<0||(day as number)>6) throw new BadRequestException(`pricingBands[${index}].daysOfWeek values must be integers 0-6`);
        return day as number;
      });
      if(new Set(days).size!==days.length) throw new BadRequestException(`pricingBands[${index}].daysOfWeek cannot contain duplicates`);
      const label=source.label===undefined?undefined:String(source.label).trim();
      if(label&&label.length>80) throw new BadRequestException(`pricingBands[${index}].label is too long`);
      return {label:label||undefined,daysOfWeek:days,startMinute,endMinute,feePaise};
    });
    for(let i=0;i<bands.length;i++){
      for(let j=i+1;j<bands.length;j++){
        const sharedDay=bands[i].daysOfWeek.some(day=>bands[j].daysOfWeek.includes(day));
        const overlaps=sharedDay&&bands[i].startMinute<bands[j].endMinute&&bands[i].endMinute>bands[j].startMinute;
        if(overlaps) throw new BadRequestException('pricingBands cannot overlap on the same day');
      }
    }
    return bands;
  }

  private resolveBookingFee(baseFeePaise:number,rules:AmenityBookingRules,startsAt:Date){
    const bands=rules.pricingBands??[];
    if(!bands.length) return baseFeePaise;
    const ist=new Date(startsAt.getTime()+330*60*1000);
    const day=ist.getUTCDay();
    const minute=ist.getUTCHours()*60+ist.getUTCMinutes();
    const band=bands.find(item=>item.daysOfWeek.includes(day)&&minute>=item.startMinute&&minute<item.endMinute);
    return band?.feePaise??baseFeePaise;
  }

  private optionalPolicyInteger(value: unknown, field: string, minimum: number, maximum?: number) {
    if (value === undefined || value === null) return undefined;
    if (!Number.isInteger(value) || (value as number) < minimum || (maximum !== undefined && (value as number) > maximum)) {
      const range=maximum===undefined?`greater than or equal to ${minimum}`:`between ${minimum} and ${maximum}`;
      throw new BadRequestException(`${field} must be an integer ${range}`);
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
