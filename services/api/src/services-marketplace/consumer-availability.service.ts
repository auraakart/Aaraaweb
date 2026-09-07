import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceBookingStatus } from '@prisma/client';
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

type MatchedWindowRow = { id: string; slotCapacity: number };

@Injectable()
export class ConsumerAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  listServiceAreas(providerId: string) {
    return this.prisma.$queryRaw<ServiceAreaRow[]>(Prisma.sql`
      SELECT * FROM "ConsumerProviderServiceArea"
      WHERE "providerId" = ${providerId}::uuid
      ORDER BY "postalCode" ASC
    `);
  }

  async addServiceArea(providerId: string, postalCode: string) {
    const normalizedPostalCode = this.normalizePostalCode(postalCode);
    const provider = await this.prisma.serviceProvider.findUnique({ where: { id: providerId }, select: { id: true } });
    if (!provider) throw new NotFoundException('Service provider not found');
    const rows = await this.prisma.$queryRaw<ServiceAreaRow[]>(Prisma.sql`
      INSERT INTO "ConsumerProviderServiceArea" ("id", "providerId", "postalCode", "active", "createdAt", "updatedAt")
      VALUES (${randomUUID()}::uuid, ${providerId}::uuid, ${normalizedPostalCode}, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
      SELECT * FROM "ConsumerOfferingAvailabilityWindow"
      WHERE "offeringId" = ${offeringId}::uuid
      ORDER BY "dayOfWeek" ASC, "startMinute" ASC
    `);
  }

  async createAvailabilityWindow(offeringId: string, input: AvailabilityWindowInput) {
    this.validateWindow(input);
    const offering = await this.prisma.serviceOffering.findUnique({ where: { id: offeringId }, select: { id: true } });
    if (!offering) throw new NotFoundException('Service offering not found');
    if (input.active ?? true) await this.assertNoWindowOverlap(offeringId, input);
    try {
      const rows = await this.prisma.$queryRaw<AvailabilityWindowRow[]>(Prisma.sql`
        INSERT INTO "ConsumerOfferingAvailabilityWindow" (
          "id", "offeringId", "dayOfWeek", "startMinute", "endMinute", "slotCapacity", "active", "createdAt", "updatedAt"
        ) VALUES (
          ${randomUUID()}::uuid, ${offeringId}::uuid, ${input.dayOfWeek}, ${input.startMinute}, ${input.endMinute},
          ${input.slotCapacity}, ${input.active ?? true}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        ) RETURNING *
      `);
      return rows[0];
    } catch (error) {
      this.rethrowWindowOverlapConstraint(error);
    }
  }

  async updateAvailabilityWindow(offeringId: string, windowId: string, patch: AvailabilityWindowPatch) {
    const currentRows = await this.prisma.$queryRaw<AvailabilityWindowRow[]>(Prisma.sql`
      SELECT * FROM "ConsumerOfferingAvailabilityWindow"
      WHERE "id" = ${windowId}::uuid AND "offeringId" = ${offeringId}::uuid LIMIT 1
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
    if (next.active ?? true) await this.assertNoWindowOverlap(offeringId, next, windowId);
    try {
      const rows = await this.prisma.$queryRaw<AvailabilityWindowRow[]>(Prisma.sql`
        UPDATE "ConsumerOfferingAvailabilityWindow"
        SET "dayOfWeek" = ${next.dayOfWeek}, "startMinute" = ${next.startMinute}, "endMinute" = ${next.endMinute},
            "slotCapacity" = ${next.slotCapacity}, "active" = ${next.active ?? true}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${windowId}::uuid AND "offeringId" = ${offeringId}::uuid
        RETURNING *
      `);
      return rows[0];
    } catch (error) {
      this.rethrowWindowOverlapConstraint(error);
    }
  }

  async checkAvailability(userId: string, homeId: string, offeringId: string, scheduledFrom: Date, scheduledUntil: Date) {
    const homes = await this.prisma.$queryRaw<Array<{ postalCode: string }>>(Prisma.sql`
      SELECT "postalCode" FROM "ConsumerHome"
      WHERE "id" = ${homeId}::uuid AND "userId" = ${userId}::uuid AND "active" = true LIMIT 1
    `);
    if (!homes[0]) throw new NotFoundException('Active home not found');
    return this.checkAvailabilityForPostalCode(homes[0].postalCode, offeringId, scheduledFrom, scheduledUntil);
  }

  async checkAvailabilityForPostalCode(postalCode: string, offeringId: string, scheduledFrom: Date, scheduledUntil: Date) {
    this.validateSchedule(scheduledFrom, scheduledUntil);
    const normalizedPostalCode = this.normalizePostalCode(postalCode);
    const slot = this.indiaSlot(scheduledFrom, scheduledUntil);
    if (!slot) return { available: false, reason: 'SERVICE_WINDOW_MUST_BE_WITHIN_ONE_DAY' };

    const windows = await this.prisma.$queryRaw<MatchedWindowRow[]>(Prisma.sql`
      SELECT w."id", w."slotCapacity"
      FROM "ServiceOffering" o
      JOIN "ServiceProvider" p ON p."id" = o."providerId" AND p."active" = true
        AND p."verification" = 'VERIFIED'::"ProviderVerificationStatus"
      JOIN "ConsumerProviderServiceArea" a ON a."providerId" = o."providerId"
        AND a."postalCode" = ${normalizedPostalCode} AND a."active" = true
      JOIN "ConsumerOfferingAvailabilityWindow" w ON w."offeringId" = o."id" AND w."active" = true
        AND w."dayOfWeek" = ${slot.dayOfWeek}
        AND w."startMinute" <= ${slot.startMinute}
        AND w."endMinute" >= ${slot.endMinute}
      WHERE o."id" = ${offeringId}::uuid AND o."active" = true
        AND (
          NOT EXISTS (SELECT 1 FROM "ConsumerOfferingServiceArea" osa WHERE osa."offeringId" = o."id")
          OR EXISTS (
            SELECT 1 FROM "ConsumerOfferingServiceArea" osa
            WHERE osa."offeringId" = o."id" AND osa."postalCode" = ${normalizedPostalCode} AND osa."active" = true
          )
        )
      ORDER BY w."startMinute" DESC
      LIMIT 1
    `);
    const window = windows[0];
    if (!window) return { available: false, reason: 'NOT_SERVICEABLE_AT_LOCATION_OR_TIME' };
    return this.capacityResult(this.prisma, window, offeringId, scheduledFrom, scheduledUntil);
  }

  async lockAndAssertBookable(
    tx: Prisma.TransactionClient,
    offeringId: string,
    providerId: string,
    postalCode: string,
    scheduledFrom: Date,
    scheduledUntil: Date,
  ) {
    const normalizedPostalCode = this.normalizePostalCode(postalCode);
    const slot = this.indiaSlot(scheduledFrom, scheduledUntil);
    if (!slot) throw new BadRequestException('Service booking must start and end on the same local day');

    const windows = await tx.$queryRaw<MatchedWindowRow[]>(Prisma.sql`
      SELECT w."id", w."slotCapacity"
      FROM "ConsumerProviderServiceArea" a
      JOIN "ConsumerOfferingAvailabilityWindow" w ON w."offeringId" = ${offeringId}::uuid
      WHERE a."providerId" = ${providerId}::uuid AND a."postalCode" = ${normalizedPostalCode} AND a."active" = true
        AND w."active" = true AND w."dayOfWeek" = ${slot.dayOfWeek}
        AND w."startMinute" <= ${slot.startMinute} AND w."endMinute" >= ${slot.endMinute}
        AND (
          NOT EXISTS (SELECT 1 FROM "ConsumerOfferingServiceArea" osa WHERE osa."offeringId" = ${offeringId}::uuid)
          OR EXISTS (
            SELECT 1 FROM "ConsumerOfferingServiceArea" osa
            WHERE osa."offeringId" = ${offeringId}::uuid AND osa."postalCode" = ${normalizedPostalCode} AND osa."active" = true
          )
        )
      ORDER BY w."startMinute" DESC
      LIMIT 1 FOR UPDATE OF w
    `);
    const window = windows[0];
    if (!window) throw new BadRequestException('Service is not available at this delivery location or requested time');

    const result = await this.capacityResult(tx, window, offeringId, scheduledFrom, scheduledUntil);
    if (!result.available) throw new BadRequestException('Selected service time is fully booked');
  }

  private async capacityResult(
    client: Pick<Prisma.TransactionClient, '$queryRaw'>,
    window: MatchedWindowRow,
    offeringId: string,
    scheduledFrom: Date,
    scheduledUntil: Date,
  ) {
    const counts = await client.$queryRaw<Array<{ bookedCount: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS "bookedCount" FROM "ConsumerServiceBooking"
      WHERE "offeringId" = ${offeringId}::uuid
        AND "status" IN (
          ${ServiceBookingStatus.REQUESTED}::"ServiceBookingStatus",
          ${ServiceBookingStatus.CONFIRMED}::"ServiceBookingStatus",
          ${ServiceBookingStatus.IN_PROGRESS}::"ServiceBookingStatus"
        )
        AND "scheduledFrom" < ${scheduledUntil} AND "scheduledUntil" > ${scheduledFrom}
    `);
    const bookedCount = counts[0]?.bookedCount ?? 0;
    return {
      available: bookedCount < window.slotCapacity,
      reason: bookedCount < window.slotCapacity ? null : 'CAPACITY_EXHAUSTED',
      slotCapacity: window.slotCapacity,
      bookedCount,
      remainingCapacity: Math.max(0, window.slotCapacity - bookedCount),
    };
  }

  private async assertNoWindowOverlap(offeringId: string, input: AvailabilityWindowInput, excludeWindowId?: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "ConsumerOfferingAvailabilityWindow"
      WHERE "offeringId" = ${offeringId}::uuid AND "active" = true AND "dayOfWeek" = ${input.dayOfWeek}
        AND "startMinute" < ${input.endMinute} AND "endMinute" > ${input.startMinute}
        AND (${excludeWindowId ?? null}::uuid IS NULL OR "id" <> ${excludeWindowId ?? null}::uuid)
      LIMIT 1
    `);
    if (rows.length) throw new BadRequestException('Availability windows for an offering cannot overlap');
  }

  private rethrowWindowOverlapConstraint(error: unknown): never {
    const databaseError = error as { code?: unknown; meta?: { code?: unknown; message?: unknown } };
    const postgresCode = databaseError.meta?.code;
    const message = String(databaseError.meta?.message ?? '');
    if (
      (databaseError.code === 'P2010' && postgresCode === '23P01')
      || message.includes('ConsumerOfferingAvailabilityWindow_no_active_overlap')
    ) {
      throw new BadRequestException('Availability windows for an offering cannot overlap');
    }
    throw error;
  }

  private normalizePostalCode(postalCode: string) {
    const normalized = postalCode.replace(/\s+/g, '');
    if (!/^[1-9][0-9]{5}$/.test(normalized)) throw new BadRequestException('Invalid Indian postal code');
    return normalized;
  }

  private validateSchedule(scheduledFrom: Date, scheduledUntil: Date) {
    if (scheduledFrom <= new Date()) throw new BadRequestException('Scheduled start must be in the future');
    if (scheduledUntil <= scheduledFrom) throw new BadRequestException('Scheduled end must be after scheduled start');
  }

  private indiaSlot(scheduledFrom: Date, scheduledUntil: Date) {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    const parse = (value: Date) => Object.fromEntries(formatter.formatToParts(value).map((part) => [part.type, part.value]));
    const start = parse(scheduledFrom);
    const end = parse(scheduledUntil);
    if (`${start.year}-${start.month}-${start.day}` !== `${end.year}-${end.month}-${end.day}`) return null;
    const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(start.weekday);
    return { dayOfWeek, startMinute: Number(start.hour) * 60 + Number(start.minute), endMinute: Number(end.hour) * 60 + Number(end.minute) };
  }

  private validateWindow(input: AvailabilityWindowInput) {
    if (!Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 0 || input.dayOfWeek > 6) throw new BadRequestException('dayOfWeek must be between 0 and 6');
    if (!Number.isInteger(input.startMinute) || input.startMinute < 0 || input.startMinute >= 1440) throw new BadRequestException('startMinute must be between 0 and 1439');
    if (!Number.isInteger(input.endMinute) || input.endMinute <= 0 || input.endMinute > 1440) throw new BadRequestException('endMinute must be between 1 and 1440');
    if (input.startMinute >= input.endMinute) throw new BadRequestException('Availability start must be before end');
    if (!Number.isInteger(input.slotCapacity) || input.slotCapacity < 1) throw new BadRequestException('slotCapacity must be at least 1');
  }
}
