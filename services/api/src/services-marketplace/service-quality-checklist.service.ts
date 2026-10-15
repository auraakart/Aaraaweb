import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerProviderOperatorService } from './consumer-provider-operator.service';

export type ChecklistItem = { id: string; label: string; required: boolean };
export type ChecklistReplacement = { expectedVersion: number; items: ChecklistItem[] };

type ChecklistRow = {
  offeringId: string;
  version: number;
  items: ChecklistItem[];
  updatedAt: Date;
};
type ConsumerChecklistRow = {
  bookingId: string;
  offeringId: string;
  templateVersion: number;
  items: ChecklistItem[];
};

/**
 * Services 4.0.1: provider-authored quality template ONLY.
 * A template preview is not a booking-time snapshot or a completion guarantee.
 */
@Injectable()
export class ServiceQualityChecklistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operators: ConsumerProviderOperatorService,
  ) {}

  async getMyTemplate(actorUserId: string, offeringId: string) {
    await this.requireOwnedOffering(actorUserId, offeringId);
    const rows = await this.prisma.$queryRaw<ChecklistRow[]>(Prisma.sql`
      SELECT "offeringId", "version", "items", "updatedAt"
      FROM "ServiceOfferingQualityChecklist"
      WHERE "offeringId" = ${offeringId}::uuid
      LIMIT 1
    `);
    return rows[0] ?? { offeringId, version: 0, items: [], updatedAt: null };
  }

  async replaceMyTemplate(actorUserId: string, offeringId: string, input: ChecklistReplacement) {
    const provider = await this.operators.resolveProvider(actorUserId);
    const items = this.normalizeItems(input.items);
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 || input.expectedVersion > 2147483646) {
      throw new BadRequestException('Invalid checklist version');
    }
    return this.prisma.$transaction(async (tx) => {
      // Serialise template changes through the offering row, including the initial insert.
      const offerings = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "ServiceOffering"
        WHERE "id" = ${offeringId}::uuid AND "providerId" = ${provider.providerId}::uuid AND "active" = true
        FOR UPDATE
      `);
      if (!offerings[0]) throw new NotFoundException('Active provider offering not found');
      const existing = await tx.$queryRaw<Array<{ version: number }>>(Prisma.sql`
        SELECT "version" FROM "ServiceOfferingQualityChecklist" WHERE "offeringId" = ${offeringId}::uuid
      `);
      const version = existing[0]?.version ?? 0;
      if (version !== input.expectedVersion) {
        throw new ConflictException('Checklist changed; reload and retry with the latest version');
      }
      const nextVersion = version + 1;
      const json = JSON.stringify(items);
      const updated = existing[0]
        ? await tx.$queryRaw<ChecklistRow[]>(Prisma.sql`
            UPDATE "ServiceOfferingQualityChecklist"
            SET "version" = ${nextVersion}, "items" = ${json}::jsonb,
                "updatedByUserId" = ${actorUserId}::uuid, "updatedAt" = CURRENT_TIMESTAMP
            WHERE "offeringId" = ${offeringId}::uuid AND "version" = ${version}
            RETURNING "offeringId", "version", "items", "updatedAt"
          `)
        : await tx.$queryRaw<ChecklistRow[]>(Prisma.sql`
            INSERT INTO "ServiceOfferingQualityChecklist"
              ("offeringId", "version", "items", "updatedByUserId")
            VALUES (${offeringId}::uuid, ${nextVersion}, ${json}::jsonb, ${actorUserId}::uuid)
            RETURNING "offeringId", "version", "items", "updatedAt"
          `);
      if (!updated[0]) throw new ConflictException('Checklist changed concurrently; retry');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ServiceOfferingQualityChecklistRevision"
          ("id", "offeringId", "version", "items", "actorUserId")
        VALUES (${randomUUID()}::uuid, ${offeringId}::uuid, ${nextVersion}, ${json}::jsonb, ${actorUserId}::uuid)
      `);
      return updated[0];
    });
  }

  async getConsumerBookingPreview(actorUserId: string, bookingId: string) {
    const rows = await this.prisma.$queryRaw<ConsumerChecklistRow[]>(Prisma.sql`
      SELECT b."id" AS "bookingId", b."offeringId",
             COALESCE(t."version", 0) AS "templateVersion",
             COALESCE(t."items", '[]'::jsonb) AS "items"
      FROM "ConsumerServiceBooking" b
      LEFT JOIN "ServiceOfferingQualityChecklist" t ON t."offeringId" = b."offeringId"
      WHERE b."id" = ${bookingId}::uuid AND b."userId" = ${actorUserId}::uuid
      LIMIT 1
    `);
    if (!rows[0]) throw new NotFoundException('Booking not found');
    return { ...rows[0], previewOnly: true };
  }

  async getConsumerBookingSnapshot(actorUserId: string, bookingId: string) {
    const rows = await this.prisma.$queryRaw<Array<{
      bookingId: string;
      offeringId: string;
      templateVersion: number;
      items: ChecklistItem[];
      capturedAt: Date | null;
      captured: boolean;
    }>>(Prisma.sql`
      SELECT b."id" AS "bookingId", b."offeringId",
             COALESCE(s."templateVersion", 0) AS "templateVersion",
             COALESCE(s."items", '[]'::jsonb) AS "items",
             s."capturedAt", (s."bookingId" IS NOT NULL) AS "captured"
      FROM "ConsumerServiceBooking" b
      LEFT JOIN "ConsumerServiceQualityChecklistSnapshot" s
        ON s."bookingId" = b."id"
      WHERE b."id" = ${bookingId}::uuid AND b."userId" = ${actorUserId}::uuid
      LIMIT 1
    `);
    if (!rows[0]) throw new NotFoundException('Booking not found');
    // Legacy bookings or offerings with no template are explicitly uncaptured.
    return { ...rows[0], immutable: rows[0].captured };
  }

  private async requireOwnedOffering(actorUserId: string, offeringId: string) {
    const provider = await this.operators.resolveProvider(actorUserId);
    const offering = await this.prisma.serviceOffering.findFirst({
      where: { id: offeringId, providerId: provider.providerId },
      select: { id: true },
    });
    if (!offering) throw new NotFoundException('Provider offering not found');
  }

  private normalizeItems(items: ChecklistItem[]): ChecklistItem[] {
    if (!Array.isArray(items) || items.length > 20) {
      throw new BadRequestException('Checklist must contain at most 20 items');
    }
    const seen = new Set<string>();
    return items.map((item) => {
      const id = typeof item?.id === 'string' ? item.id.trim() : '';
      const label = typeof item?.label === 'string' ? item.label.trim() : '';
      if (!/^[a-z][a-z0-9_]{1,39}$/.test(id) || label.length < 2 || label.length > 120 ||
          typeof item?.required !== 'boolean' || seen.has(id)) {
        throw new BadRequestException('Invalid or duplicate checklist item');
      }
      seen.add(id);
      return { id, label, required: item.required };
    });
  }
}
