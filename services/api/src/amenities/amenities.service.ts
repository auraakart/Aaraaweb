import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AmenityPolicyEngine, type AmenityBlackoutWindow, type AmenityBookingRules } from './amenity-policy.engine';
import { AmenityAnalyticsQuery } from './amenity-analytics.query';
import { AmenityBookingCreator } from './amenity-booking-creator';

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
  private readonly policy = new AmenityPolicyEngine();
  private readonly analyticsQuery: AmenityAnalyticsQuery;
  private readonly bookingCreator: AmenityBookingCreator;

  constructor(private readonly prisma: PrismaService) {
    this.analyticsQuery = new AmenityAnalyticsQuery(prisma);
    this.bookingCreator = new AmenityBookingCreator(prisma);
  }

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

  createBooking(
    societyId: string,
    userId: string,
    amenityId: string,
    input: { unitId: string; startsAt: string; endsAt: string; idempotencyKey?: string; guestCount?: number },
  ) {
    return this.bookingCreator.createBooking(societyId, userId, amenityId, input);
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
      const rules=this.policy.parseBookingRules(amenity.bookingRules);
      const guestCount=input.guestCount??0;
      this.policy.validateGuestCount(rules,guestCount);
      this.policy.assertScheduleWindowOpen(amenity.schedule,startsAt,endsAt);
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

      const rules = this.policy.parseBookingRules(active.bookingRules);
      if (
        rules.cancellationCutoffMinutes !== undefined
        && active.startsAt.getTime() - Date.now() < rules.cancellationCutoffMinutes * 60000
      ) {
        throw new ConflictException(`Booking cannot be cancelled within ${rules.cancellationCutoffMinutes} minutes of start time`);
      }

      const rows = await tx.$queryRaw`
        UPDATE "AmenityBooking"
        SET "status" = 'CANCELLED',
            "depositStatus"=CASE
              WHEN "depositStatus"='CAPTURED' THEN 'REFUND_REQUIRED'
              WHEN "depositPaise">0 AND "depositStatus" IN ('APPROVAL_PENDING','PAYMENT_REQUIRED') THEN 'VOIDED'
              ELSE "depositStatus"
            END,
            "updatedAt" = CURRENT_TIMESTAMP
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
            "depositStatus"=CASE
              WHEN "depositStatus"='CAPTURED' THEN 'REFUND_REQUIRED'
              WHEN "depositPaise">0 AND "depositStatus" IN ('APPROVAL_PENDING','PAYMENT_REQUIRED') THEN 'VOIDED'
              ELSE "depositStatus"
            END,
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
      const rows = await tx.$queryRaw<Array<{ startsAt: Date; endsAt: Date; status: string; bookingRules: unknown; depositPaise:number; depositStatus:string }>>`
        SELECT b."startsAt", b."endsAt", b."status"::text AS "status", a."bookingRules",b."depositPaise",b."depositStatus"
        FROM "AmenityBooking" b
        JOIN "Amenity" a ON a."id"=b."amenityId" AND a."societyId"=b."societyId"
        WHERE b."id"=${bookingId}::uuid AND b."societyId"=${societyId}::uuid
        FOR UPDATE OF b
      `;
      const booking = rows[0];
      if (!booking) throw new NotFoundException('Amenity booking not found');
      if (booking.status !== 'CONFIRMED') throw new ConflictException('Only confirmed amenity bookings can check in');
      if(booking.depositPaise>0&&booking.depositStatus!=='CAPTURED'){
        throw new ConflictException('Refundable deposit must be captured before amenity check-in');
      }
      const rules = this.policy.parseBookingRules(booking.bookingRules);
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
          "depositStatus"=CASE WHEN "depositStatus"='CAPTURED' THEN 'REFUND_REQUIRED' ELSE "depositStatus" END,
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
      const rules = this.policy.parseBookingRules(booking.bookingRules);
      const eligibleAt = booking.startsAt.getTime() + (rules.noShowGraceMinutes ?? 15) * 60000;
      if (Date.now() < eligibleAt) throw new ConflictException('No-show grace period has not elapsed');

      const updated = await tx.$queryRaw`
        UPDATE "AmenityBooking"
        SET "status"='NO_SHOW',
            "depositStatus"=CASE WHEN "depositStatus"='CAPTURED' THEN 'REFUND_REQUIRED' ELSE "depositStatus" END,
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

  async expireUnpaidDeposits(limit=50) {
    return this.prisma.$transaction(async(tx)=>{
      const candidates=await tx.$queryRaw<Array<{id:string;societyId:string;amenityId:string;startsAt:Date;endsAt:Date}>>`
        SELECT "id","societyId","amenityId","startsAt","endsAt"
        FROM "AmenityBooking"
        WHERE "status"='CONFIRMED'
          AND "depositStatus"='PAYMENT_REQUIRED'
          AND "depositPaise">0
          AND "depositDueAt" IS NOT NULL
          AND "depositDueAt"<=CURRENT_TIMESTAMP
        ORDER BY "depositDueAt","id"
        LIMIT ${Math.max(1,Math.min(200,Math.trunc(limit)))}
        FOR UPDATE SKIP LOCKED
      `;
      let expired=0;
      for(const candidate of candidates){
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${candidate.societyId}:${candidate.amenityId}`}))`;
        const closed=await tx.$queryRaw<Array<{id:string}>>`
          UPDATE "AmenityBooking"
          SET "status"='CANCELLED',"depositStatus"='VOIDED',"updatedAt"=CURRENT_TIMESTAMP
          WHERE "id"=${candidate.id}::uuid
            AND "societyId"=${candidate.societyId}::uuid
            AND "status"='CONFIRMED'
            AND "depositStatus"='PAYMENT_REQUIRED'
            AND "depositDueAt"<=CURRENT_TIMESTAMP
          RETURNING "id"
        `;
        if(!closed[0]) continue;
        expired++;
        await this.promoteNextWaitlist(tx,candidate.societyId,candidate.amenityId,candidate.startsAt,candidate.endsAt);
      }
      return {expired,mutationPerformed:expired>0,boundary:'Only unpaid refundable-deposit reservations past their server deadline are released. Captured funds are never auto-refunded or forfeited.'};
    });
  }

  analytics(societyId: string) {
    return this.analyticsQuery.run(societyId);
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
      const schedule=this.policy.scheduleObject(amenity.schedule);
      const blackouts=this.policy.scheduleBlackouts(schedule);
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
      const schedule=this.policy.scheduleObject(amenity.schedule);
      const blackouts=this.policy.scheduleBlackouts(schedule);
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
    const normalized=this.policy.normalizeWeeklySchedule(weekly);
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
    const normalized=this.policy.normalizeWeeklySchedule(weekly);
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
      const schedule=this.policy.scheduleObject(amenity.schedule);
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
    this.policy.parseBookingRules(input.bookingRules ?? {});
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
      const existingRules=this.policy.parseBookingRules(existing.bookingRules);
      const nextRules=this.policy.parseBookingRules(input.bookingRules ?? existing.bookingRules);

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
      const pending=await tx.$queryRaw<Array<{
        id:string;amenityId:string;startsAt:Date;endsAt:Date;depositPaise:number;depositPaymentWindowMinutes:number|null;
      }>>`
        SELECT "id","amenityId","startsAt","endsAt","depositPaise","depositPaymentWindowMinutes"
        FROM "AmenityBooking"
        WHERE "id"=${bookingId}::uuid AND "societyId"=${societyId}::uuid AND "status"='PENDING'
        FOR UPDATE
      `;
      const current=pending[0];
      if(!current) throw new NotFoundException('Pending amenity booking not found');
      const depositRequired=current.depositPaise>0;
      const depositWindow=current.depositPaymentWindowMinutes??0;
      const rows = await tx.$queryRaw<Array<Record<string,unknown>&{amenityId:string;startsAt:Date;endsAt:Date}>>`
        UPDATE "AmenityBooking"
        SET "status" = ${nextStatus}::"AmenityBookingStatus",
            "depositStatus"=CASE
              WHEN ${nextStatus}='REJECTED' AND "depositPaise">0 THEN 'VOIDED'
              WHEN ${nextStatus}='CONFIRMED' AND "depositPaise">0 THEN 'PAYMENT_REQUIRED'
              ELSE 'NOT_REQUIRED'
            END,
            "depositDueAt"=CASE
              WHEN ${nextStatus}='CONFIRMED' AND ${depositRequired}
                THEN LEAST("startsAt",CURRENT_TIMESTAMP+make_interval(mins=>${depositWindow}::int))
              ELSE NULL
            END,
            "reviewedByUserId" = ${reviewerUserId}::uuid,
            "reviewNote" = ${note?.trim() || null},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${bookingId}::uuid
          AND "societyId" = ${societyId}::uuid
          AND "status" = 'PENDING'
        RETURNING *
      `;
      const booking=rows[0];
      if(!booking) throw new ConflictException('Amenity booking changed before review');
      if(nextStatus==='REJECTED') await this.promoteNextWaitlist(tx,societyId,current.amenityId,current.startsAt,current.endsAt);
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
    if(this.policy.findScheduleBlackout(amenity.schedule,startsAt,endsAt)) return null;
    if(!this.policy.isWeeklyOperatingWindowOpen(amenity.schedule,startsAt,endsAt)) return null;
    const rules=this.policy.parseBookingRules(amenity.bookingRules);
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
    const bookingFeePaise=this.policy.resolveBookingFee(amenity.feePaise,rules,waiter.startsAt);
    const depositPaise=rules.refundableDepositPaise??0;
    const depositWindow=rules.depositPaymentWindowMinutes??null;
    const depositStatus=depositPaise<=0?'NOT_REQUIRED':status==='PENDING'?'APPROVAL_PENDING':'PAYMENT_REQUIRED';
    const bookings=await tx.$queryRaw<Array<{id:string}>>`
      INSERT INTO "AmenityBooking" (
        "societyId","amenityId","unitId","userId","startsAt","endsAt","status","feePaise","currency","guestCount",
        "depositPaise","depositStatus","depositDueAt","depositPaymentWindowMinutes"
      ) VALUES (
        ${societyId}::uuid,${amenityId}::uuid,${waiter.unitId}::uuid,${waiter.userId}::uuid,
        ${waiter.startsAt},${waiter.endsAt},${status}::"AmenityBookingStatus",${bookingFeePaise},${amenity.currency},${waiter.guestCount},
        ${depositPaise},${depositStatus},
        CASE WHEN ${depositStatus}='PAYMENT_REQUIRED' THEN LEAST(${waiter.startsAt},CURRENT_TIMESTAMP+make_interval(mins=>${depositWindow??0}::int)) ELSE NULL END,
        ${depositWindow}
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
    if(this.policy.findScheduleBlackout(amenity.schedule,startsAt,endsAt)){
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
