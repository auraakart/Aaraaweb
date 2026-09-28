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
  noShowRestrictionCount?: number;
  noShowLookbackDays?: number;
  noShowBlockDays?: number;
  maxGuestsPerBooking?: number;
  conflictGroup?: string;
  pricingBands?: AmenityPricingBand[];
};

type AmenityBlackoutWindow = {
  start:string;
  end:string;
  reason?:string;
  kind?:'MAINTENANCE'|'CLOSURE'|'PRIVATE_EVENT';
};

type AmenityWeeklyWindow = { start:string; end:string };
type AmenityWeeklySchedule = Partial<Record<'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun',AmenityWeeklyWindow[]>>;

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
      this.assertScheduleWindowOpen(amenity.schedule,startsAt,endsAt);
      await this.assertNoShowEligibility(tx,societyId,amenityId,userId,rules);
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
      this.assertScheduleWindowOpen(amenity.schedule,startsAt,endsAt);
      await this.assertNoShowEligibility(tx,societyId,amenityId,userId,rules);
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
      const identity=await tx.$queryRaw<Array<{amenityId:string}>>`
        SELECT "amenityId" FROM "AmenityBooking"
        WHERE "id"=${bookingId}::uuid AND "societyId"=${societyId}::uuid
        LIMIT 1
      `;
      if(!identity[0]) throw new NotFoundException('Amenity booking not found');
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${societyId}:${identity[0].amenityId}`}))`;
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

  async previewBlackout(
    societyId:string,
    amenityId:string,
    input:{startsAt:string;endsAt:string;kind?:'MAINTENANCE'|'CLOSURE'|'PRIVATE_EVENT';reason:string},
  ){
    return this.prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${societyId}:${amenityId}`}))`;
      return this.blackoutAssessment(tx,societyId,amenityId,input);
    });
  }

  async applyBlackout(
    societyId:string,
    amenityId:string,
    input:{startsAt:string;endsAt:string;kind?:'MAINTENANCE'|'CLOSURE'|'PRIVATE_EVENT';reason:string},
  ){
    return this.prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${societyId}:${amenityId}`}))`;
      const assessment=await this.blackoutAssessment(tx,societyId,amenityId,input);
      if(assessment.impactedBookings.length||assessment.impactedWaitlist.length){
        throw new ConflictException(`Resolve ${assessment.impactedBookings.length} active booking(s) and ${assessment.impactedWaitlist.length} waitlist entry/entries before applying this blackout`);
      }
      const [amenity]=await tx.$queryRaw<Array<{schedule:unknown}>>`
        SELECT "schedule" FROM "Amenity"
        WHERE "id"=${amenityId}::uuid AND "societyId"=${societyId}::uuid
        FOR UPDATE
      `;
      if(!amenity) throw new NotFoundException('Amenity not found');
      const schedule=this.scheduleObject(amenity.schedule);
      const blackouts=this.scheduleBlackouts(schedule);
      const newWindow: AmenityBlackoutWindow = {
        start:assessment.blackout.start,
        end:assessment.blackout.end,
        kind:assessment.blackout.kind,
        reason:assessment.blackout.reason,
      };
      const nextSchedule={...schedule,blackouts:[...blackouts,newWindow]};
      await tx.$executeRaw`
        UPDATE "Amenity" SET "schedule"=${JSON.stringify(nextSchedule)}::jsonb,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${amenityId}::uuid AND "societyId"=${societyId}::uuid
      `;
      return {
        blackout:newWindow,
        impactedBookings:[],
        impactedWaitlist:[],
        automaticCancellation:false,
        boundary:'Blackout was added only after impact revalidation. Existing reservation lifecycles are never mutated automatically.',
      };
    });
  }

  async removeBlackout(
    societyId:string,
    amenityId:string,
    input:{startsAt:string;endsAt:string},
  ){
    const startsAt=new Date(input.startsAt),endsAt=new Date(input.endsAt);
    if(!Number.isFinite(startsAt.getTime())||!Number.isFinite(endsAt.getTime())||startsAt>=endsAt){
      throw new BadRequestException('A valid blackout window is required');
    }
    return this.prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${societyId}:${amenityId}`}))`;
      const [amenity]=await tx.$queryRaw<Array<{schedule:unknown}>>`
        SELECT "schedule" FROM "Amenity"
        WHERE "id"=${amenityId}::uuid AND "societyId"=${societyId}::uuid
        FOR UPDATE
      `;
      if(!amenity) throw new NotFoundException('Amenity not found');
      const schedule=this.scheduleObject(amenity.schedule);
      const blackouts=this.scheduleBlackouts(schedule);
      const startIso=startsAt.toISOString(),endIso=endsAt.toISOString();
      const next=blackouts.filter(item=>new Date(item.start).toISOString()!==startIso||new Date(item.end).toISOString()!==endIso);
      if(next.length===blackouts.length) throw new NotFoundException('Amenity blackout not found');
      const nextSchedule={...schedule,blackouts:next};
      await tx.$executeRaw`
        UPDATE "Amenity" SET "schedule"=${JSON.stringify(nextSchedule)}::jsonb,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${amenityId}::uuid AND "societyId"=${societyId}::uuid
      `;
      return {removed:true,start:startIso,end:endIso,automaticPromotion:false};
    });
  }

  async previewOperatingHours(societyId:string,amenityId:string,weekly:Record<string,unknown>|null){
    const normalized=this.normalizeWeeklySchedule(weekly);
    return this.prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${societyId}:${amenityId}`}))`;
      const [amenity]=await tx.$queryRaw<Array<{id:string}>>`
        SELECT "id" FROM "Amenity"
        WHERE "id"=${amenityId}::uuid AND "societyId"=${societyId}::uuid
        LIMIT 1
      `;
      if(!amenity) throw new NotFoundException('Amenity not found');
      const [counts]=await tx.$queryRaw<Array<{bookingCount:number;waitlistCount:number}>>`
        SELECT
          (SELECT COUNT(*)::int FROM "AmenityBooking"
            WHERE "societyId"=${societyId}::uuid AND "amenityId"=${amenityId}::uuid
              AND "status" IN ('PENDING','CONFIRMED','CHECKED_IN') AND "endsAt">CURRENT_TIMESTAMP) AS "bookingCount",
          (SELECT COUNT(*)::int FROM "AmenityWaitlistEntry"
            WHERE "societyId"=${societyId}::uuid AND "amenityId"=${amenityId}::uuid
              AND "status"='WAITING' AND "endsAt">CURRENT_TIMESTAMP) AS "waitlistCount"
      `;
      const futureBookingCount=Number(counts?.bookingCount??0);
      const futureWaitlistCount=Number(counts?.waitlistCount??0);
      return {weekly:normalized,futureBookingCount,futureWaitlistCount,canApply:futureBookingCount===0&&futureWaitlistCount===0,mutationPerformed:false,boundary:'Preview only. Existing future bookings and waitlist entries must be resolved before operating hours change.'};
    });
  }

  async applyOperatingHours(societyId:string,amenityId:string,weekly:Record<string,unknown>|null){
    const normalized=this.normalizeWeeklySchedule(weekly);
    return this.prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${societyId}:${amenityId}`}))`;
      const [amenity]=await tx.$queryRaw<Array<{schedule:unknown}>>`
        SELECT "schedule" FROM "Amenity"
        WHERE "id"=${amenityId}::uuid AND "societyId"=${societyId}::uuid
        FOR UPDATE
      `;
      if(!amenity) throw new NotFoundException('Amenity not found');
      const [counts]=await tx.$queryRaw<Array<{bookingCount:number;waitlistCount:number}>>`
        SELECT
          (SELECT COUNT(*)::int FROM "AmenityBooking"
            WHERE "societyId"=${societyId}::uuid AND "amenityId"=${amenityId}::uuid
              AND "status" IN ('PENDING','CONFIRMED','CHECKED_IN') AND "endsAt">CURRENT_TIMESTAMP) AS "bookingCount",
          (SELECT COUNT(*)::int FROM "AmenityWaitlistEntry"
            WHERE "societyId"=${societyId}::uuid AND "amenityId"=${amenityId}::uuid
              AND "status"='WAITING' AND "endsAt">CURRENT_TIMESTAMP) AS "waitlistCount"
      `;
      const bookingCount=Number(counts?.bookingCount??0),waitlistCount=Number(counts?.waitlistCount??0);
      if(bookingCount||waitlistCount) throw new ConflictException(`Resolve ${bookingCount} future booking(s) and ${waitlistCount} waiting entry/entries before changing operating hours`);
      const schedule=this.scheduleObject(amenity.schedule);
      const nextSchedule={...schedule};
      if(normalized===null) delete nextSchedule.weekly; else nextSchedule.weekly=normalized;
      await tx.$executeRaw`
        UPDATE "Amenity" SET "schedule"=${JSON.stringify(nextSchedule)}::jsonb,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${amenityId}::uuid AND "societyId"=${societyId}::uuid
      `;
      return {weekly:normalized,mutationPerformed:true,automaticReservationChange:false};
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
    if(this.findScheduleBlackout(amenity.schedule,startsAt,endsAt)) return null;
    if(!this.isWeeklyOperatingWindowOpen(amenity.schedule,startsAt,endsAt)) return null;
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
        AND (
          ${rules.noShowRestrictionCount ?? null}::int IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM "AmenityBooking" ns
            WHERE ns."societyId"=w."societyId"
              AND ns."amenityId"=w."amenityId"
              AND ns."userId"=w."userId"
              AND ns."status"='NO_SHOW'
              AND ns."noShowAt" IS NOT NULL
              AND ns."noShowAt">=CURRENT_TIMESTAMP-(${rules.noShowLookbackDays ?? 1} * INTERVAL '1 day')
            GROUP BY ns."userId"
            HAVING COUNT(*)>=${rules.noShowRestrictionCount ?? 2147483647}
              AND MAX(ns."noShowAt")+(${rules.noShowBlockDays ?? 1} * INTERVAL '1 day')>CURRENT_TIMESTAMP
          )
        )
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
    const noShowRestrictionCount=this.optionalPolicyInteger(source.noShowRestrictionCount,'noShowRestrictionCount',1,10);
    const noShowLookbackDays=this.optionalPolicyInteger(source.noShowLookbackDays,'noShowLookbackDays',1,365);
    const noShowBlockDays=this.optionalPolicyInteger(source.noShowBlockDays,'noShowBlockDays',1,365);
    const noShowParts=[noShowRestrictionCount,noShowLookbackDays,noShowBlockDays].filter(item=>item!==undefined).length;
    if(noShowParts!==0&&noShowParts!==3){
      throw new BadRequestException('noShowRestrictionCount, noShowLookbackDays and noShowBlockDays must be configured together');
    }
    return {
      minAdvanceMinutes: this.optionalPolicyInteger(source.minAdvanceMinutes, 'minAdvanceMinutes', 0),
      maxAdvanceDays: this.optionalPolicyInteger(source.maxAdvanceDays, 'maxAdvanceDays', 1),
      maxFutureBookingsPerUnit: this.optionalPolicyInteger(source.maxFutureBookingsPerUnit, 'maxFutureBookingsPerUnit', 1),
      maxBookingsPerDayPerUnit: this.optionalPolicyInteger(source.maxBookingsPerDayPerUnit, 'maxBookingsPerDayPerUnit', 1),
      cooldownMinutes: this.optionalPolicyInteger(source.cooldownMinutes, 'cooldownMinutes', 0),
      cancellationCutoffMinutes: this.optionalPolicyInteger(source.cancellationCutoffMinutes, 'cancellationCutoffMinutes', 0),
      checkInOpenMinutesBefore: this.optionalPolicyInteger(source.checkInOpenMinutesBefore, 'checkInOpenMinutesBefore', 0),
      noShowGraceMinutes: this.optionalPolicyInteger(source.noShowGraceMinutes, 'noShowGraceMinutes', 0),
      noShowRestrictionCount,
      noShowLookbackDays,
      noShowBlockDays,
      maxGuestsPerBooking: this.optionalPolicyInteger(source.maxGuestsPerBooking, 'maxGuestsPerBooking', 0, 50),
      conflictGroup: this.optionalConflictGroup(source.conflictGroup),
      pricingBands: this.parsePricingBands(source.pricingBands),
    };
  }

  private async blackoutAssessment(
    tx:Prisma.TransactionClient,
    societyId:string,
    amenityId:string,
    input:{startsAt:string;endsAt:string;kind?:'MAINTENANCE'|'CLOSURE'|'PRIVATE_EVENT';reason:string},
  ){
    const startsAt=new Date(input.startsAt),endsAt=new Date(input.endsAt);
    if(!Number.isFinite(startsAt.getTime())||!Number.isFinite(endsAt.getTime())||startsAt>=endsAt){
      throw new BadRequestException('A valid blackout window is required');
    }
    if(endsAt.getTime()<=Date.now()) throw new BadRequestException('Amenity blackout must end in the future');
    const reason=input.reason.trim();
    if(reason.length<3) throw new BadRequestException('Blackout reason must contain at least 3 characters');
    const kind=input.kind??'MAINTENANCE';
    const [amenity]=await tx.$queryRaw<Array<{schedule:unknown}>>`
      SELECT "schedule" FROM "Amenity"
      WHERE "id"=${amenityId}::uuid AND "societyId"=${societyId}::uuid
      LIMIT 1
    `;
    if(!amenity) throw new NotFoundException('Amenity not found');
    if(this.findScheduleBlackout(amenity.schedule,startsAt,endsAt)){
      throw new ConflictException('Amenity already has an overlapping configured blackout');
    }
    const impactedBookings=await tx.$queryRaw<Array<{id:string;unitNumber:string;buildingName:string;status:string;startsAt:Date;endsAt:Date}>>`
      SELECT b."id",u."number" AS "unitNumber",bd."name" AS "buildingName",b."status"::text AS "status",b."startsAt",b."endsAt"
      FROM "AmenityBooking" b
      JOIN "Unit" u ON u."id"=b."unitId" AND u."societyId"=b."societyId"
      JOIN "Building" bd ON bd."id"=u."buildingId" AND bd."societyId"=u."societyId"
      WHERE b."societyId"=${societyId}::uuid AND b."amenityId"=${amenityId}::uuid
        AND b."status" IN ('PENDING','CONFIRMED','CHECKED_IN')
        AND b."startsAt"<${endsAt} AND b."endsAt">${startsAt}
      ORDER BY b."startsAt" ASC
    `;
    const impactedWaitlist=await tx.$queryRaw<Array<{id:string;unitNumber:string;startsAt:Date;endsAt:Date}>>`
      SELECT w."id",u."number" AS "unitNumber",w."startsAt",w."endsAt"
      FROM "AmenityWaitlistEntry" w
      JOIN "Unit" u ON u."id"=w."unitId" AND u."societyId"=w."societyId"
      WHERE w."societyId"=${societyId}::uuid AND w."amenityId"=${amenityId}::uuid
        AND w."status"='WAITING'
        AND w."startsAt"<${endsAt} AND w."endsAt">${startsAt}
      ORDER BY w."startsAt" ASC,w."joinedAt" ASC
    `;
    return {
      blackout:{start:startsAt.toISOString(),end:endsAt.toISOString(),kind,reason},
      impactedBookings,
      impactedWaitlist,
      canApply:impactedBookings.length===0&&impactedWaitlist.length===0,
      mutationPerformed:false,
      automaticCancellation:false,
      boundary:'Preview only. Resolve overlapping bookings and waitlist entries explicitly before applying the blackout.',
    };
  }

  private scheduleObject(value:unknown):Record<string,unknown>{
    if(!value||typeof value!=='object'||Array.isArray(value)) return {};
    return value as Record<string,unknown>;
  }

  private scheduleBlackouts(value:unknown):AmenityBlackoutWindow[]{
    const source=this.scheduleObject(value);
    const raw=source.blackouts;
    if(!Array.isArray(raw)) return [];
    return raw.flatMap(item=>{
      if(!item||typeof item!=='object'||Array.isArray(item)) return [];
      const candidate=item as Record<string,unknown>;
      if(typeof candidate.start!=='string'||typeof candidate.end!=='string') return [];
      const start=new Date(candidate.start),end=new Date(candidate.end);
      if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||start>=end) return [];
      const kind=typeof candidate.kind==='string'&&['MAINTENANCE','CLOSURE','PRIVATE_EVENT'].includes(candidate.kind)
        ? candidate.kind as AmenityBlackoutWindow['kind']
        : 'MAINTENANCE';
      return [{start:start.toISOString(),end:end.toISOString(),reason:typeof candidate.reason==='string'?candidate.reason:undefined,kind}];
    });
  }

  private findScheduleBlackout(schedule:unknown,startsAt:Date,endsAt:Date){
    return this.scheduleBlackouts(schedule).find(item=>{
      const start=new Date(item.start),end=new Date(item.end);
      return startsAt<end&&endsAt>start;
    })??null;
  }

  private assertScheduleWindowOpen(schedule:unknown,startsAt:Date,endsAt:Date){
    const blackout=this.findScheduleBlackout(schedule,startsAt,endsAt);
    if(blackout){
      throw new ConflictException(`Amenity is unavailable during the configured ${(blackout.kind??'MAINTENANCE').toLowerCase().replaceAll('_',' ')} window`);
    }
    const weekly=this.scheduleWeekly(schedule);
    if(weekly&&!this.isWeeklyOperatingWindowOpen(schedule,startsAt,endsAt)){
      const istStart=new Date(startsAt.getTime()+330*60*1000);
      const istEnd=new Date(endsAt.getTime()+330*60*1000);
      if(istStart.getUTCFullYear()!==istEnd.getUTCFullYear()||istStart.getUTCMonth()!==istEnd.getUTCMonth()||istStart.getUTCDate()!==istEnd.getUTCDate()) throw new ConflictException('Amenity booking must fit within one India-local operating day');
      const windows=weekly[this.indiaDayKey(istStart)]??[];
      if(!windows.length) throw new ConflictException('Amenity is closed for the requested India-local day');
      throw new ConflictException('Amenity request is outside configured operating hours');
    }
  }

  private scheduleWeekly(value:unknown):AmenityWeeklySchedule|null{
    const raw=this.scheduleObject(value).weekly;
    if(raw===undefined||raw===null) return null;
    if(typeof raw!=='object'||Array.isArray(raw)) return null;
    const source=raw as Record<string,unknown>;
    const result:AmenityWeeklySchedule={};
    for(const day of ['mon','tue','wed','thu','fri','sat','sun'] as const){
      const items=source[day];
      if(items===undefined){result[day]=[];continue}
      if(!Array.isArray(items)){result[day]=[];continue}
      result[day]=items.flatMap(item=>{
        if(!item||typeof item!=='object'||Array.isArray(item)) return [];
        const candidate=item as Record<string,unknown>;
        if(typeof candidate.start!=='string'||typeof candidate.end!=='string') return [];
        if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(candidate.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(candidate.end)||candidate.start>=candidate.end) return [];
        return [{start:candidate.start,end:candidate.end}];
      });
    }
    return result;
  }

  private normalizeWeeklySchedule(value:Record<string,unknown>|null):AmenityWeeklySchedule|null{
    if(value===null) return null;
    const days=['mon','tue','wed','thu','fri','sat','sun'] as const;
    const allowed=new Set<string>(days);
    for(const key of Object.keys(value)) if(!allowed.has(key)) throw new BadRequestException(`Unsupported amenity weekday key: ${key}`);
    const normalized=this.scheduleWeekly({weekly:value});
    if(!normalized) throw new BadRequestException('Amenity schedule.weekly must be an object');
    for(const day of days){
      const raw=value[day];
      if(raw===undefined) throw new BadRequestException(`Operating hours must explicitly include ${day}`);
      if(!Array.isArray(raw)) throw new BadRequestException(`Amenity schedule day ${day} must be an array`);
      if((normalized[day]??[]).length!==raw.length) throw new BadRequestException(`Amenity schedule day ${day} contains an invalid HH:MM operating window`);
    }
    return normalized;
  }

  private indiaDayKey(value:Date):keyof AmenityWeeklySchedule{
    switch(value.getUTCDay()){
      case 0:return 'sun';case 1:return 'mon';case 2:return 'tue';case 3:return 'wed';
      case 4:return 'thu';case 5:return 'fri';default:return 'sat';
    }
  }

  private isWeeklyOperatingWindowOpen(schedule:unknown,startsAt:Date,endsAt:Date){
    const weekly=this.scheduleWeekly(schedule);
    if(!weekly) return true;
    const localStart=new Date(startsAt.getTime()+330*60*1000),localEnd=new Date(endsAt.getTime()+330*60*1000);
    if(localStart.getUTCFullYear()!==localEnd.getUTCFullYear()||localStart.getUTCMonth()!==localEnd.getUTCMonth()||localStart.getUTCDate()!==localEnd.getUTCDate()) return false;
    const windows=weekly[this.indiaDayKey(localStart)]??[];
    const startMinute=localStart.getUTCHours()*60+localStart.getUTCMinutes();
    const endMinute=localEnd.getUTCHours()*60+localEnd.getUTCMinutes();
    return windows.some(window=>startMinute>=this.hhmmToMinute(window.start)&&endMinute<=this.hhmmToMinute(window.end));
  }

  private hhmmToMinute(value:string){
    const [hour,minute]=value.split(':').map(Number);
    return hour*60+minute;
  }

  private async noShowEligibility(
    tx:Prisma.TransactionClient,
    societyId:string,
    amenityId:string,
    userId:string,
    rules:AmenityBookingRules,
  ){
    if(
      rules.noShowRestrictionCount===undefined
      || rules.noShowLookbackDays===undefined
      || rules.noShowBlockDays===undefined
    ){
      return {restricted:false,noShowCount:0,restrictedUntil:null as Date|null};
    }
    const rows=await tx.$queryRaw<Array<{noShowCount:number;latestNoShowAt:Date|null}>>`
      SELECT COUNT(*)::int AS "noShowCount",MAX("noShowAt") AS "latestNoShowAt"
      FROM "AmenityBooking"
      WHERE "societyId"=${societyId}::uuid
        AND "amenityId"=${amenityId}::uuid
        AND "userId"=${userId}::uuid
        AND "status"='NO_SHOW'
        AND "noShowAt" IS NOT NULL
        AND "noShowAt">=CURRENT_TIMESTAMP-(${rules.noShowLookbackDays} * INTERVAL '1 day')
    `;
    const noShowCount=Number(rows[0]?.noShowCount??0);
    const latest=rows[0]?.latestNoShowAt??null;
    const restrictedUntil=latest?new Date(latest.getTime()+rules.noShowBlockDays*24*60*60*1000):null;
    return {
      restricted:noShowCount>=rules.noShowRestrictionCount&&restrictedUntil!==null&&restrictedUntil.getTime()>Date.now(),
      noShowCount,
      restrictedUntil,
    };
  }

  private async assertNoShowEligibility(
    tx:Prisma.TransactionClient,
    societyId:string,
    amenityId:string,
    userId:string,
    rules:AmenityBookingRules,
  ){
    const state=await this.noShowEligibility(tx,societyId,amenityId,userId,rules);
    if(!state.restricted) return state;
    const until=state.restrictedUntil?.toISOString().slice(0,10)??'the configured pause period';
    throw new ConflictException(`New bookings for this amenity are paused until ${until} after repeated no-shows`);
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
