import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProviderVerificationStatus, ServiceBookingStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerAvailabilityService } from './consumer-availability.service';

export type ConsumerHomeInput = {
  label: string;
  addressLine1: string;
  addressLine2?: string;
  locality: string;
  city: string;
  state: string;
  postalCode: string;
  latitude?: number;
  longitude?: number;
};

export type ConsumerBookingInput = {
  homeId?: string;
  locationType?: 'HOME' | 'SOCIETY_UNIT';
  locationId?: string;
  offeringId: string;
  scheduledFrom: Date;
  scheduledUntil: Date;
  notes?: string;
};

type ConsumerHomeRow = {
  id: string;
  userId: string;
  label: string;
  addressLine1: string;
  addressLine2: string | null;
  locality: string;
  city: string;
  state: string;
  postalCode: string;
  latitude: Prisma.Decimal | null;
  longitude: Prisma.Decimal | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type BookingLocationRow = {
  homeId: string | null;
  societyUnitId: string | null;
  societyId: string | null;
  type: 'HOME' | 'SOCIETY_UNIT';
  label: string;
  addressLine1: string;
  addressLine2: string | null;
  locality: string;
  city: string;
  state: string;
  postalCode: string;
  latitude: string | null;
  longitude: string | null;
};

type ConsumerBookingRow = {
  id: string;
  userId: string;
  homeId: string | null;
  societyUnitId: string | null;
  providerId: string;
  offeringId: string;
  offeringName: string;
  providerName: string;
  addressSnapshot: Record<string, unknown>;
  status: ServiceBookingStatus;
  scheduledFrom: Date;
  scheduledUntil: Date;
  servicePricePaise: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ConsumerBookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: ConsumerAvailabilityService,
  ) {}

  listHomes(userId: string) {
    return this.prisma.$queryRaw<ConsumerHomeRow[]>(Prisma.sql`
      SELECT * FROM "ConsumerHome"
      WHERE "userId" = ${userId}::uuid AND "active" = true
      ORDER BY "createdAt" DESC
    `);
  }

  async createHome(userId: string, input: ConsumerHomeInput) {
    const id = randomUUID();
    const rows = await this.prisma.$queryRaw<ConsumerHomeRow[]>(Prisma.sql`
      INSERT INTO "ConsumerHome" (
        "id", "userId", "label", "addressLine1", "addressLine2", "locality", "city", "state", "postalCode", "latitude", "longitude", "active", "createdAt", "updatedAt"
      ) VALUES (
        ${id}::uuid, ${userId}::uuid, ${input.label}, ${input.addressLine1}, ${input.addressLine2 ?? null},
        ${input.locality}, ${input.city}, ${input.state}, ${input.postalCode}, ${input.latitude ?? null}, ${input.longitude ?? null},
        true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ) RETURNING *
    `);
    return rows[0];
  }

  async updateHome(userId: string, homeId: string, input: ConsumerHomeInput) {
    const rows = await this.prisma.$queryRaw<ConsumerHomeRow[]>(Prisma.sql`
      UPDATE "ConsumerHome"
      SET "label" = ${input.label}, "addressLine1" = ${input.addressLine1}, "addressLine2" = ${input.addressLine2 ?? null},
          "locality" = ${input.locality}, "city" = ${input.city}, "state" = ${input.state}, "postalCode" = ${input.postalCode},
          "latitude" = ${input.latitude ?? null}, "longitude" = ${input.longitude ?? null}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${homeId}::uuid AND "userId" = ${userId}::uuid AND "active" = true
      RETURNING *
    `);
    if (!rows.length) throw new NotFoundException('Home not found');
    return rows[0];
  }

  listBookings(userId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT
        b.*,
        b."addressSnapshot"->>'label' AS "homeLabel",
        b."addressSnapshot"->>'addressLine1' AS "addressLine1",
        b."addressSnapshot"->>'locality' AS "locality",
        b."addressSnapshot"->>'city' AS "city",
        b."addressSnapshot"->>'locationType' AS "locationType"
      FROM "ConsumerServiceBooking" b
      WHERE b."userId" = ${userId}::uuid
      ORDER BY b."createdAt" DESC
    `);
  }

  listBookingEvents(userId: string, bookingId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT e."id", e."action", e."fromStatus", e."toStatus", e."note", e."occurredAt"
      FROM "ConsumerServiceBookingEvent" e
      JOIN "ConsumerServiceBooking" b ON b."id" = e."bookingId"
      WHERE e."bookingId" = ${bookingId}::uuid AND b."userId" = ${userId}::uuid
      ORDER BY e."occurredAt" ASC
    `);
  }

  async createBooking(userId: string, input: ConsumerBookingInput) {
    const now = new Date();
    if (input.scheduledFrom <= now) throw new BadRequestException('Scheduled start must be in the future');
    if (input.scheduledUntil <= input.scheduledFrom) throw new BadRequestException('Scheduled end must be after scheduled start');

    const locationType = input.homeId ? 'HOME' : input.locationType;
    const locationId = input.homeId ?? input.locationId;
    if (!locationType || !locationId) throw new BadRequestException('A service delivery location is required');
    if (input.homeId && (input.locationType || input.locationId)) {
      throw new BadRequestException('Use either legacy homeId or locationType/locationId, not both');
    }

    return this.prisma.$transaction(async (tx) => {
      const location = await this.resolveBookingLocation(tx, userId, locationType, locationId);

      const offering = await tx.serviceOffering.findFirst({
        where: {
          id: input.offeringId,
          active: true,
          provider: { active: true, verification: ProviderVerificationStatus.VERIFIED },
        },
        select: {
          id: true,
          name: true,
          providerId: true,
          pricePaise: true,
          provider: { select: { businessName: true } },
        },
      });
      if (!offering) throw new NotFoundException('Verified service offering not found');

      await this.availability.lockAndAssertBookable(
        tx,
        offering.id,
        offering.providerId,
        location.postalCode,
        input.scheduledFrom,
        input.scheduledUntil,
      );

      const addressSnapshot = JSON.stringify({
        locationType: location.type,
        societyId: location.societyId,
        unitId: location.societyUnitId,
        label: location.label,
        addressLine1: location.addressLine1,
        addressLine2: location.addressLine2,
        locality: location.locality,
        city: location.city,
        state: location.state,
        postalCode: location.postalCode,
        latitude: location.latitude,
        longitude: location.longitude,
      });

      const id = randomUUID();
      const rows = await tx.$queryRaw<ConsumerBookingRow[]>(Prisma.sql`
        INSERT INTO "ConsumerServiceBooking" (
          "id", "userId", "homeId", "societyUnitId", "providerId", "offeringId", "offeringName", "providerName",
          "addressSnapshot", "status", "scheduledFrom", "scheduledUntil", "servicePricePaise", "notes", "createdAt", "updatedAt"
        ) VALUES (
          ${id}::uuid, ${userId}::uuid, ${location.homeId}::uuid, ${location.societyUnitId}::uuid,
          ${offering.providerId}::uuid, ${offering.id}::uuid, ${offering.name}, ${offering.provider.businessName},
          ${addressSnapshot}::jsonb, ${ServiceBookingStatus.REQUESTED}::"ServiceBookingStatus", ${input.scheduledFrom},
          ${input.scheduledUntil}, ${offering.pricePaise}, ${input.notes ?? null}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        ) RETURNING *
      `);
      return rows[0];
    });
  }

  async cancelBooking(userId: string, bookingId: string) {
    return this.prisma.$transaction(async (tx) => {
      const currentRows = await tx.$queryRaw<Array<{ id: string; status: ServiceBookingStatus }>>(Prisma.sql`
        SELECT "id", "status" FROM "ConsumerServiceBooking"
        WHERE "id" = ${bookingId}::uuid AND "userId" = ${userId}::uuid FOR UPDATE
      `);
      const current = currentRows[0];
      const cancellableStatuses: readonly ServiceBookingStatus[] = [ServiceBookingStatus.REQUESTED, ServiceBookingStatus.CONFIRMED];
      if (!current || !cancellableStatuses.includes(current.status)) throw new BadRequestException('Booking cannot be cancelled');

      const rows = await tx.$queryRaw<ConsumerBookingRow[]>(Prisma.sql`
        UPDATE "ConsumerServiceBooking"
        SET "status" = ${ServiceBookingStatus.CANCELLED}::"ServiceBookingStatus", "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${bookingId}::uuid AND "userId" = ${userId}::uuid
          AND "status" = ${current.status}::"ServiceBookingStatus"
        RETURNING *
      `);
      if (!rows.length) throw new BadRequestException('Booking changed concurrently; retry cancellation');

      await tx.$queryRaw(Prisma.sql`
        INSERT INTO "ConsumerServiceBookingEvent" (
          "id", "bookingId", "actorUserId", "action", "fromStatus", "toStatus", "occurredAt"
        ) VALUES (
          ${randomUUID()}::uuid, ${bookingId}::uuid, ${userId}::uuid, 'CANCELLED',
          ${current.status}::"ServiceBookingStatus", ${ServiceBookingStatus.CANCELLED}::"ServiceBookingStatus", CURRENT_TIMESTAMP
        )
      `);
      return rows[0];
    });
  }

  private async resolveBookingLocation(
    tx: Prisma.TransactionClient,
    userId: string,
    locationType: 'HOME' | 'SOCIETY_UNIT',
    locationId: string,
  ): Promise<BookingLocationRow> {
    if (locationType === 'HOME') {
      const rows = await tx.$queryRaw<BookingLocationRow[]>(Prisma.sql`
        SELECT h."id" AS "homeId", NULL::uuid AS "societyUnitId", NULL::uuid AS "societyId", 'HOME'::text AS "type",
          h."label", h."addressLine1", h."addressLine2", h."locality", h."city", h."state", h."postalCode",
          h."latitude"::text AS "latitude", h."longitude"::text AS "longitude"
        FROM "ConsumerHome" h
        WHERE h."id" = ${locationId}::uuid AND h."userId" = ${userId}::uuid AND h."active" = true LIMIT 1
      `);
      if (!rows[0]) throw new NotFoundException('Active home not found');
      return rows[0];
    }

    const rows = await tx.$queryRaw<BookingLocationRow[]>(Prisma.sql`
      SELECT NULL::uuid AS "homeId", u."id" AS "societyUnitId", s."id" AS "societyId", 'SOCIETY_UNIT'::text AS "type",
        CONCAT(s."name", ' · ', b."name", ' ', u."number") AS "label",
        CONCAT(b."name", ' ', u."number", ', ', a."addressLine1") AS "addressLine1",
        a."addressLine2", a."locality", a."city", a."state", a."postalCode",
        a."latitude"::text AS "latitude", a."longitude"::text AS "longitude"
      FROM "Unit" u
      JOIN "Building" b ON b."id" = u."buildingId"
      JOIN "Society" s ON s."id" = u."societyId" AND s."status" = 'ACTIVE'::"SocietyStatus"
      JOIN "SocietyServiceAddress" a ON a."societyId" = s."id" AND a."active" = true
      WHERE u."id" = ${locationId}::uuid AND (
        EXISTS (
          SELECT 1 FROM "UnitOccupancy" o WHERE o."unitId" = u."id" AND o."userId" = ${userId}::uuid AND o."active" = true
            AND o."effectiveFrom" <= CURRENT_TIMESTAMP AND (o."effectiveTo" IS NULL OR o."effectiveTo" > CURRENT_TIMESTAMP)
        ) OR EXISTS (
          SELECT 1 FROM "UnitOwnership" ow WHERE ow."unitId" = u."id" AND ow."userId" = ${userId}::uuid AND ow."active" = true
            AND ow."verified" = true
            AND ow."effectiveFrom" <= CURRENT_TIMESTAMP AND (ow."effectiveTo" IS NULL OR ow."effectiveTo" > CURRENT_TIMESTAMP)
        )
      ) LIMIT 1
    `);
    if (!rows[0]) throw new NotFoundException('Service-ready society unit not found');
    return rows[0];
  }
}
