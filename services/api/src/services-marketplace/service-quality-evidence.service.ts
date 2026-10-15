import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceBookingStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerProviderAgentService } from './consumer-provider-agent.service';
import { ChecklistItem } from './service-quality-checklist.service';

export type QualityEvidenceInput = { itemId: string; passed: boolean; note?: string };
type AssignmentBookingRow = { bookingId: string };
type SnapshotRow = { items: ChecklistItem[] };

/**
 * Services 4.0.3 — evidence events are append-only and anchored to the
 * immutable booking checklist. These events do NOT alter booking completion.
 */
@Injectable()
export class ServiceQualityEvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agents: ConsumerProviderAgentService,
  ) {}

  async recordForAgent(actorUserId: string, assignmentId: string, input: QualityEvidenceInput) {
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(input.itemId) || typeof input.passed !== 'boolean') {
      throw new BadRequestException('Invalid quality checklist assessment');
    }
    const note = input.note?.trim() || null;
    if (note && note.length > 500) throw new BadRequestException('Quality checklist note is too long');
    const agent = await this.agents.resolveAgent(actorUserId);
    return this.prisma.$transaction(async (tx) => {
      // This booking lock serializes evidence submission against consumer
      // completion, which also locks the booking row.
      const assignments = await tx.$queryRaw<AssignmentBookingRow[]>(Prisma.sql`
        SELECT b."id" AS "bookingId"
        FROM "ConsumerServiceAssignment" a
        JOIN "ConsumerServiceBooking" b
          ON b."id" = a."bookingId" AND b."providerId" = a."providerId"
        WHERE a."id" = ${assignmentId}::uuid
          AND a."agentId" = ${agent.agentId}::uuid
          AND a."providerId" = ${agent.providerId}::uuid
          AND a."status" = 'ARRIVED'::"ConsumerDispatchStatus"
          AND b."status" = ${ServiceBookingStatus.IN_PROGRESS}::"ServiceBookingStatus"
        FOR UPDATE OF b
      `);
      const assignment = assignments[0];
      if (!assignment) throw new NotFoundException('Active assigned service is not available');
      const snapshots = await tx.$queryRaw<SnapshotRow[]>(Prisma.sql`
        SELECT "items" FROM "ConsumerServiceQualityChecklistSnapshot"
        WHERE "bookingId" = ${assignment.bookingId}::uuid LIMIT 1
      `);
      if (!snapshots[0] || !Array.isArray(snapshots[0].items) ||
          !snapshots[0].items.some((item) => item.id === input.itemId)) {
        throw new BadRequestException('Checklist item is not part of this booking');
      }
      const rows = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        INSERT INTO "ConsumerServiceQualityEvidence" (
          "id", "bookingId", "assignmentId", "agentId", "actorUserId", "itemId", "passed", "note"
        ) VALUES (
          ${randomUUID()}::uuid, ${assignment.bookingId}::uuid, ${assignmentId}::uuid,
          ${agent.agentId}::uuid, ${actorUserId}::uuid,
          ${input.itemId}, ${input.passed}, ${note}
        ) RETURNING "id", "bookingId", "assignmentId", "agentId", "itemId", "passed", "note", "recordedAt"
      `);
      return rows[0];
    });
  }

  async listForAgent(actorUserId: string, assignmentId: string) {
    const agent = await this.agents.resolveAgent(actorUserId);
    const assignments = await this.prisma.$queryRaw<AssignmentBookingRow[]>(Prisma.sql`
      SELECT b."id" AS "bookingId"
      FROM "ConsumerServiceAssignment" a
      JOIN "ConsumerServiceBooking" b
        ON b."id" = a."bookingId" AND b."providerId" = a."providerId"
      WHERE a."id" = ${assignmentId}::uuid
        AND a."agentId" = ${agent.agentId}::uuid
        AND a."providerId" = ${agent.providerId}::uuid
      LIMIT 1
    `);
    if (!assignments[0]) throw new NotFoundException('Provider assignment not found');
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT "id", "bookingId", "assignmentId", "itemId", "passed", "note", "recordedAt"
      FROM "ConsumerServiceQualityEvidence"
      WHERE "bookingId" = ${assignments[0].bookingId}::uuid
        AND "assignmentId" = ${assignmentId}::uuid
      ORDER BY "recordedAt" ASC, "id" ASC
    `);
  }

  async listForConsumer(actorUserId: string, bookingId: string) {
    const owned = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "ConsumerServiceBooking"
      WHERE "id" = ${bookingId}::uuid AND "userId" = ${actorUserId}::uuid LIMIT 1
    `);
    if (!owned[0]) throw new NotFoundException('Booking not found');
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT "id", "bookingId", "assignmentId", "itemId", "passed", "note", "recordedAt"
      FROM "ConsumerServiceQualityEvidence"
      WHERE "bookingId" = ${bookingId}::uuid
      ORDER BY "recordedAt" ASC, "id" ASC
    `);
  }
}
