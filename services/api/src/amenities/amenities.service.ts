import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
    input: { unitId: string; startsAt: string; endsAt: string },
  ) {
    await this.assertUnitAccess(societyId, userId, input.unitId);
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || startsAt >= endsAt) {
      throw new BadRequestException('A valid booking window is required');
    }
    if (startsAt.getTime() <= Date.now()) throw new BadRequestException('Amenity bookings must start in the future');

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`${societyId}:${amenityId}`}))`;

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

      const overlaps = await tx.$queryRaw<CountRow[]>`
        SELECT COUNT(*)::int AS "count"
        FROM "AmenityBooking"
        WHERE "societyId" = ${societyId}::uuid
          AND "amenityId" = ${amenityId}::uuid
          AND "status" IN ('PENDING', 'CONFIRMED')
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
          "status", "feePaise", "currency"
        ) VALUES (
          ${societyId}::uuid, ${amenityId}::uuid, ${input.unitId}::uuid, ${userId}::uuid,
          ${startsAt}, ${endsAt}, ${status}::"AmenityBookingStatus", ${amenity.feePaise}, ${amenity.currency}
        )
        RETURNING *
      `;
      return Array.isArray(rows) ? rows[0] : rows;
    });
  }

  async cancelMine(societyId: string, userId: string, bookingId: string) {
    const rows = await this.prisma.$queryRaw`
      UPDATE "AmenityBooking"
      SET "status" = 'CANCELLED', "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${bookingId}::uuid
        AND "societyId" = ${societyId}::uuid
        AND "userId" = ${userId}::uuid
        AND "status" IN ('PENDING', 'CONFIRMED')
      RETURNING *
    `;
    const booking = Array.isArray(rows) ? rows[0] : undefined;
    if (!booking) throw new NotFoundException('Active amenity booking not found');
    return booking;
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

      const structuralChange = existing.slotMinutes !== input.slotMinutes || existing.maxConcurrentBookings !== input.maxConcurrentBookings;
      if (structuralChange) {
        const futureRows = await tx.$queryRaw<CountRow[]>`
          SELECT COUNT(*)::int AS "count"
          FROM "AmenityBooking"
          WHERE "societyId" = ${societyId}::uuid
            AND "amenityId" = ${amenityId}::uuid
            AND "status" IN ('PENDING', 'CONFIRMED')
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
    const rows = await this.prisma.$queryRaw`
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
    const booking = Array.isArray(rows) ? rows[0] : undefined;
    if (!booking) throw new NotFoundException('Pending amenity booking not found');
    return booking;
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
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505';
  }
}
