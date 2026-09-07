import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export type AvailabilityWindowInput = {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  slotCapacity: number;
  active?: boolean;
};

export type AvailabilityWindowPatch = Partial<AvailabilityWindowInput>;

type ServiceAreaRow = {
  id: string;
  providerId: string;
  postalCode: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type AvailabilityWindowRow = {
  id: string;
  offeringId: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  slotCapacity: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ConsumerAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  listServiceAreas(providerId: string) {
    return this.prisma.$queryRaw<ServiceAreaRow[]>(Prisma.sql`
      SELECT *
      FROM "ConsumerProviderServiceArea"
      WHERE "providerId" = ${providerId}::uuid
      ORDER BY "postalCode" ASC
    `);
  }

  async addServiceArea(providerId: string, postalCode: string) {
    const normalizedPostalCode = this.normalizePostalCode(postalCode);
    const provider = await this.prisma.serviceProvider.findUnique({ where: { id: providerId }, select: { id: true } });
    if (!provider) throw new NotFoundException('Service provider not found');

    const rows = await this.prisma.$queryRaw<ServiceAreaRow[]>(Prisma.sql`
      INSERT INTO "ConsumerProviderServiceArea" (
        "id", "providerId", "postalCode", "active", "createdAt", "updatedAt"
      ) VALUES (
        ${randomUUID()}::uuid,
        ${providerId}::uuid,
        ${normalizedPostalCode},
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("providerId", "postalCode")
      DO UPDATE SET "active" = true, "updatedAt" = CURRENT_TIMESTAMP
      RETURNING *
    `);
    return rows[0];
  }

  async setServiceAreaActive(providerId: string, areaId: string, active: boolean) {
    const rows = await this.prisma.$queryRaw<ServiceAreaRow[]>(Prisma.sql`
      UPDATE "ConsumerProviderServiceArea"
      SET "active" = ${active}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${areaId}::uuid AND "providerId" = ${providerId}::uuid
      RETURNING *
    `);
    if (!rows.length) throw new NotFoundException('Provider service area not found');
    return rows[0];
  }

  listAvailabilityWindows(offeringId: string) {
    return this.prisma.$queryRaw<AvailabilityWindowRow[]>(Prisma.sql`
      SELECT *
      FROM "ConsumerOfferingAvailabilityWindow"
      WHERE "offeringId" = ${offeringId}::uuid
      ORDER BY "dayOfWeek" ASC, "startMinute" ASC
    `);
  }

  async createAvailabilityWindow(offeringId: string, input: AvailabilityWindowInput) {
    this.validateWindow(input);
    const offering = await this.prisma.serviceOffering.findUnique({ where: { id: offeringId }, select: { id: true } });
    if (!offering) throw new NotFoundException('Service offering not found');

    const rows = await this.prisma.$queryRaw<AvailabilityWindowRow[]>(Prisma.sql`
      INSERT INTO "ConsumerOfferingAvailabilityWindow" (
        "id", "offeringId", "dayOfWeek", "startMinute", "endMinute", "slotCapacity", "active", "createdAt", "updatedAt"
      ) VALUES (
        ${randomUUID()}::uuid,
        ${offeringId}::uuid,
        ${input.dayOfWeek},
        ${input.startMinute},
        ${input.endMinute},
        ${input.slotCapacity},
        ${input.active ?? true},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      RETURNING *
    `);
    return rows[0];
  }

  async updateAvailabilityWindow(offeringId: string, windowId: string, patch: AvailabilityWindowPatch) {
    const currentRows = await this.prisma.$queryRaw<AvailabilityWindowRow[]>(Prisma.sql`
      SELECT *
      FROM "ConsumerOfferingAvailabilityWindow"
      WHERE "id" = ${windowId}::uuid AND "offeringId" = ${offeringId}::uuid
      LIMIT 1
    `);
    const current = currentRows[0];
    if (!current) throw new NotFoundException('Availability window not found');

    const next: AvailabilityWindowInput = {
      dayOfWeek: patch.dayOfWeek ?? current.dayOfWeek,
      startMinute: patch.startMinute ?? current.startMinute,
      endMinute: patch.endMinute ?? current.endMinute,
      slotCapacity: patch.slotCapacity ?? current.slotCapacity,
      active: patch.active ?? current.active,
    };
    this.validateWindow(next);

    const rows = await this.prisma.$queryRaw<AvailabilityWindowRow[]>(Prisma.sql`
      UPDATE "ConsumerOfferingAvailabilityWindow"
      SET
        "dayOfWeek" = ${next.dayOfWeek},
        "startMinute" = ${next.startMinute},
        "endMinute" = ${next.endMinute},
        "slotCapacity" = ${next.slotCapacity},
        "active" = ${next.active ?? true},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${windowId}::uuid AND "offeringId" = ${offeringId}::uuid
      RETURNING *
    `);
    return rows[0];
  }

  private normalizePostalCode(postalCode: string) {
    const normalized = postalCode.replace(/\s+/g, '');
    if (!/^[1-9][0-9]{5}$/.test(normalized)) throw new BadRequestException('Invalid Indian postal code');
    return normalized;
  }

  private validateWindow(input: AvailabilityWindowInput) {
    if (!Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 0 || input.dayOfWeek > 6) {
      throw new BadRequestException('dayOfWeek must be between 0 and 6');
    }
    if (!Number.isInteger(input.startMinute) || input.startMinute < 0 || input.startMinute >= 1440) {
      throw new BadRequestException('startMinute must be between 0 and 1439');
    }
    if (!Number.isInteger(input.endMinute) || input.endMinute <= 0 || input.endMinute > 1440) {
      throw new BadRequestException('endMinute must be between 1 and 1440');
    }
    if (input.startMinute >= input.endMinute) throw new BadRequestException('Availability start must be before end');
    if (!Number.isInteger(input.slotCapacity) || input.slotCapacity < 1) {
      throw new BadRequestException('slotCapacity must be at least 1');
    }
  }
}
