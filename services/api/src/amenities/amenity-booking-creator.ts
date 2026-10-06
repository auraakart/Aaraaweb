import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AmenityPolicyEngine, type AmenityBookingRules } from './amenity-policy.engine';

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

export class AmenityBookingCreator {
  private readonly policy = new AmenityPolicyEngine();

  constructor(private readonly prisma: PrismaService) {}

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

      const rules = this.policy.parseBookingRules(amenity.bookingRules);
      this.policy.validateGuestCount(rules, guestCount);
      this.policy.assertScheduleWindowOpen(amenity.schedule,startsAt,endsAt);
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
      const bookingFeePaise = this.policy.resolveBookingFee(amenity.feePaise, rules, startsAt);
      const depositPaise=rules.refundableDepositPaise??0;
      const depositWindow=rules.depositPaymentWindowMinutes??null;
      const depositStatus=depositPaise<=0?'NOT_REQUIRED':status==='PENDING'?'APPROVAL_PENDING':'PAYMENT_REQUIRED';
      const rows = await tx.$queryRaw`
        INSERT INTO "AmenityBooking" (
          "societyId", "amenityId", "unitId", "userId", "startsAt", "endsAt",
          "status", "feePaise", "currency", "guestCount", "idempotencyKey",
          "depositPaise","depositStatus","depositDueAt","depositPaymentWindowMinutes"
        ) VALUES (
          ${societyId}::uuid, ${amenityId}::uuid, ${input.unitId}::uuid, ${userId}::uuid,
          ${startsAt}, ${endsAt}, ${status}::"AmenityBookingStatus", ${bookingFeePaise}, ${amenity.currency},
          ${guestCount}, ${idempotencyKey}, ${depositPaise}, ${depositStatus},
          CASE WHEN ${depositStatus}='PAYMENT_REQUIRED' THEN LEAST(${startsAt},CURRENT_TIMESTAMP+make_interval(mins=>${depositWindow??0}::int)) ELSE NULL END,
          ${depositWindow}
        )
        RETURNING *
      `;
      return Array.isArray(rows) ? rows[0] : rows;
    }).catch((error) => {
      if (this.isUniqueViolation(error)) throw new ConflictException('Amenity booking already exists for this unit, slot or idempotency key');
      throw error;
    });
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
    const rows=await tx.$queryRaw<Array<{noShowCount:number;restrictedUntil:Date|null;evaluatedAt:Date|null}>>`
      SELECT
        COUNT(*)::int AS "noShowCount",
        MAX("noShowAt")+(${rules.noShowBlockDays} * INTERVAL '1 day') AS "restrictedUntil",
        CURRENT_TIMESTAMP AS "evaluatedAt"
      FROM "AmenityBooking"
      WHERE "societyId"=${societyId}::uuid
        AND "amenityId"=${amenityId}::uuid
        AND "userId"=${userId}::uuid
        AND "status"='NO_SHOW'
        AND "noShowAt" IS NOT NULL
        AND "noShowAt">=CURRENT_TIMESTAMP-(${rules.noShowLookbackDays} * INTERVAL '1 day')
    `;
    const noShowCount=Number(rows[0]?.noShowCount??0);
    const restrictedUntil=rows[0]?.restrictedUntil??null;
    const evaluatedAt=rows[0]?.evaluatedAt??null;
    return {
      restricted:noShowCount>=rules.noShowRestrictionCount
        && restrictedUntil!==null
        && evaluatedAt!==null
        && restrictedUntil.getTime()>evaluatedAt.getTime(),
      noShowCount,
      restrictedUntil,
    };
  }

  async assertNoShowEligibility(
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
