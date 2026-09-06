import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProviderVerificationStatus, ServiceBookingStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

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
  homeId: string;
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

type ConsumerBookingRow = {
  id: string;
  userId: string;
  homeId: string;
  providerId: string;
  offeringId: string;
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
  constructor(private readonly prisma: PrismaService) {}

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
        ${id}::uuid,
        ${userId}::uuid,
        ${input.label},
        ${input.addressLine1},
        ${input.addressLine2 ?? null},
        ${input.locality},
        ${input.city},
        ${input.state},
        ${input.postalCode},
        ${input.latitude ?? null},
        ${input.longitude ?? null},
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      RETURNING *
    `);
    return rows[0];
  }

  async updateHome(userId: string, homeId: string, input: ConsumerHomeInput) {
    const rows = await this.prisma.$queryRaw<ConsumerHomeRow[]>(Prisma.sql`
      UPDATE "ConsumerHome"
      SET
        "label" = ${input.label},
        "addressLine1" = ${input.addressLine1},
        "addressLine2" = ${input.addressLine2 ?? null},
        "locality" = ${input.locality},
        "city" = ${input.city},
        "state" = ${input.state},
        "postalCode" = ${input.postalCode},
        "latitude" = ${input.latitude ?? null},
        "longitude" = ${input.longitude ?? null},
        "updatedAt" = CURRENT_TIMESTAMP
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
        h."label" AS "homeLabel",
        h."addressLine1",
        h."locality",
        h."city",
        o."name" AS "offeringName",
        p."businessName" AS "providerName"
      FROM "ConsumerServiceBooking" b
      JOIN "ConsumerHome" h ON h."id" = b."homeId"
      JOIN "ServiceOffering" o ON o."id" = b."offeringId"
      JOIN "ServiceProvider" p ON p."id" = b."providerId"
      WHERE b."userId" = ${userId}::uuid
      ORDER BY b."createdAt" DESC
    `);
  }

  async createBooking(userId: string, input: ConsumerBookingInput) {
    const now = new Date();
    if (input.scheduledFrom <= now) throw new BadRequestException('Scheduled start must be in the future');
    if (input.scheduledUntil <= input.scheduledFrom) throw new BadRequestException('Scheduled end must be after scheduled start');

    const homeRows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "ConsumerHome"
      WHERE "id" = ${input.homeId}::uuid AND "userId" = ${userId}::uuid AND "active" = true
      LIMIT 1
    `);
    if (!homeRows.length) throw new NotFoundException('Active home not found');

    const offering = await this.prisma.serviceOffering.findFirst({
      where: {
        id: input.offeringId,
        active: true,
        provider: {
          active: true,
          verification: ProviderVerificationStatus.VERIFIED,
        },
      },
      select: {
        id: true,
        providerId: true,
        pricePaise: true,
      },
    });
    if (!offering) throw new NotFoundException('Verified service offering not found');

    const id = randomUUID();
    const rows = await this.prisma.$queryRaw<ConsumerBookingRow[]>(Prisma.sql`
      INSERT INTO "ConsumerServiceBooking" (
        "id", "userId", "homeId", "providerId", "offeringId", "status", "scheduledFrom", "scheduledUntil", "servicePricePaise", "notes", "createdAt", "updatedAt"
      ) VALUES (
        ${id}::uuid,
        ${userId}::uuid,
        ${input.homeId}::uuid,
        ${offering.providerId}::uuid,
        ${offering.id}::uuid,
        ${ServiceBookingStatus.REQUESTED}::"ServiceBookingStatus",
        ${input.scheduledFrom},
        ${input.scheduledUntil},
        ${offering.pricePaise},
        ${input.notes ?? null},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      RETURNING *
    `);
    return rows[0];
  }

  async cancelBooking(userId: string, bookingId: string) {
    const rows = await this.prisma.$queryRaw<ConsumerBookingRow[]>(Prisma.sql`
      UPDATE "ConsumerServiceBooking"
      SET "status" = ${ServiceBookingStatus.CANCELLED}::"ServiceBookingStatus", "updatedAt" = CURRENT_TIMESTAMP
      WHERE
        "id" = ${bookingId}::uuid
        AND "userId" = ${userId}::uuid
        AND "status" IN (${ServiceBookingStatus.REQUESTED}::"ServiceBookingStatus", ${ServiceBookingStatus.CONFIRMED}::"ServiceBookingStatus")
      RETURNING *
    `);
    if (!rows.length) throw new BadRequestException('Booking cannot be cancelled');
    return rows[0];
  }
}
