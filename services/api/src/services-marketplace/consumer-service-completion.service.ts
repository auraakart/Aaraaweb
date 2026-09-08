import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceBookingStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PushNotificationService } from '../notifications/push-notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerProviderAgentService } from './consumer-provider-agent.service';

type AssignmentRow = {
  id: string;
  bookingId: string;
  providerId: string;
  agentId: string;
  status: 'ASSIGNED' | 'ACCEPTED' | 'REJECTED' | 'EN_ROUTE' | 'ARRIVED' | 'RELEASED';
};

type BookingRow = {
  id: string;
  userId: string;
  providerId: string;
  status: ServiceBookingStatus;
};

type CompletionNotificationRow = {
  userId: string;
  bookingId: string;
  offeringName: string;
  providerName: string;
  agentDisplayName: string | null;
};

@Injectable()
export class ConsumerServiceCompletionService {
  private readonly logger = new Logger(ConsumerServiceCompletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agents: ConsumerProviderAgentService,
    private readonly push: PushNotificationService,
  ) {}

  async startByAgent(userId: string, assignmentId: string) {
    const agent = await this.agents.resolveAgent(userId);
    return this.prisma.$transaction(async (tx) => {
      const assignment = await this.lockOwnedAssignment(tx, assignmentId, agent.agentId, agent.providerId);
      if (assignment.status !== 'ARRIVED') throw new BadRequestException('Service can start only after the assigned agent has arrived');
      const booking = await this.lockBooking(tx, assignment.bookingId);
      if (booking.status !== ServiceBookingStatus.CONFIRMED) throw new BadRequestException('Only confirmed bookings can be started');
      const rows = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        UPDATE "ConsumerServiceBooking"
        SET "status" = ${ServiceBookingStatus.IN_PROGRESS}::"ServiceBookingStatus", "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${booking.id}::uuid AND "status" = ${ServiceBookingStatus.CONFIRMED}::"ServiceBookingStatus"
        RETURNING *
      `);
      if (!rows[0]) throw new BadRequestException('Booking changed concurrently; retry the action');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ConsumerServiceBookingEvent" ("id", "bookingId", "actorUserId", "action", "fromStatus", "toStatus", "occurredAt")
        VALUES (${randomUUID()}::uuid, ${booking.id}::uuid, ${userId}::uuid, 'AGENT_STARTED_SERVICE', ${ServiceBookingStatus.CONFIRMED}::"ServiceBookingStatus", ${ServiceBookingStatus.IN_PROGRESS}::"ServiceBookingStatus", CURRENT_TIMESTAMP)
      `);
      return rows[0];
    });
  }

  async requestCompletionByAgent(userId: string, assignmentId: string, note?: string) {
    const agent = await this.agents.resolveAgent(userId);
    const result = await this.prisma.$transaction(async (tx) => {
      const assignment = await this.lockOwnedAssignment(tx, assignmentId, agent.agentId, agent.providerId);
      if (assignment.status !== 'ARRIVED') throw new BadRequestException('Completion can be requested only after arrival');
      const booking = await this.lockBooking(tx, assignment.bookingId);
      if (booking.status !== ServiceBookingStatus.IN_PROGRESS) throw new BadRequestException('Completion can be requested only for an in-progress booking');
      const existing = await tx.$queryRaw<Array<{ occurredAt: Date }>>(Prisma.sql`
        SELECT "occurredAt" FROM "ConsumerServiceAssignmentEvent"
        WHERE "assignmentId" = ${assignment.id}::uuid AND "type" = 'COMPLETION_REQUESTED'
        ORDER BY "occurredAt" DESC LIMIT 1
      `);
      if (existing[0]) {
        return { assignmentId: assignment.id, bookingId: booking.id, status: 'PENDING' as const, requestedAt: existing[0].occurredAt, created: false };
      }
      const requestedAt = new Date();
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ConsumerServiceAssignmentEvent" ("id", "assignmentId", "actorUserId", "type", "fromStatus", "toStatus", "note", "occurredAt")
        VALUES (${randomUUID()}::uuid, ${assignment.id}::uuid, ${userId}::uuid, 'COMPLETION_REQUESTED', 'ARRIVED'::"ConsumerDispatchStatus", 'ARRIVED'::"ConsumerDispatchStatus", ${note?.trim() || null}, ${requestedAt})
      `);
      return { assignmentId: assignment.id, bookingId: booking.id, status: 'PENDING' as const, requestedAt, created: true };
    });

    if (result.created) {
      void this.publishCompletionRequest(result.bookingId, result.assignmentId).catch((error: unknown) => {
        this.logger.warn(`Completion request push failed for ${result.bookingId}: ${error instanceof Error ? error.message : 'unknown error'}`);
      });
    }
    return {
      assignmentId: result.assignmentId,
      bookingId: result.bookingId,
      status: result.status,
      requestedAt: result.requestedAt,
    };
  }

  async getForConsumer(userId: string, bookingId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ bookingId: string; bookingStatus: ServiceBookingStatus; assignmentId: string | null; assignmentStatus: string | null; agentDisplayName: string | null; requestedAt: Date | null; confirmedAt: Date | null }>>(Prisma.sql`
      SELECT b."id" AS "bookingId", b."status" AS "bookingStatus", a."id" AS "assignmentId", a."status" AS "assignmentStatus", ag."displayName" AS "agentDisplayName",
        (SELECT e."occurredAt" FROM "ConsumerServiceAssignmentEvent" e WHERE e."assignmentId" = a."id" AND e."type" = 'COMPLETION_REQUESTED' ORDER BY e."occurredAt" DESC LIMIT 1) AS "requestedAt",
        (SELECT e."occurredAt" FROM "ConsumerServiceAssignmentEvent" e WHERE e."assignmentId" = a."id" AND e."type" = 'CUSTOMER_CONFIRMED_COMPLETION' ORDER BY e."occurredAt" DESC LIMIT 1) AS "confirmedAt"
      FROM "ConsumerServiceBooking" b
      LEFT JOIN LATERAL (SELECT a.* FROM "ConsumerServiceAssignment" a WHERE a."bookingId" = b."id" ORDER BY a."createdAt" DESC LIMIT 1) a ON true
      LEFT JOIN "ConsumerProviderAgent" ag ON ag."id" = a."agentId"
      WHERE b."id" = ${bookingId}::uuid AND b."userId" = ${userId}::uuid LIMIT 1
    `);
    const row = rows[0];
    if (!row) throw new NotFoundException('Booking not found');
    return row;
  }

  async confirmByConsumer(userId: string, bookingId: string) {
    return this.prisma.$transaction(async (tx) => {
      const bookingRows = await tx.$queryRaw<BookingRow[]>(Prisma.sql`
        SELECT "id", "userId", "providerId", "status" FROM "ConsumerServiceBooking"
        WHERE "id" = ${bookingId}::uuid AND "userId" = ${userId}::uuid FOR UPDATE
      `);
      const booking = bookingRows[0];
      if (!booking) throw new NotFoundException('Booking not found');
      if (booking.status !== ServiceBookingStatus.IN_PROGRESS) throw new BadRequestException('Only in-progress bookings can be confirmed complete');
      const assignmentRows = await tx.$queryRaw<AssignmentRow[]>(Prisma.sql`
        SELECT "id", "bookingId", "providerId", "agentId", "status" FROM "ConsumerServiceAssignment"
        WHERE "bookingId" = ${booking.id}::uuid AND "status" = 'ARRIVED'::"ConsumerDispatchStatus"
        ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE
      `);
      const assignment = assignmentRows[0];
      if (!assignment) throw new BadRequestException('No arrived provider assignment is available for completion');
      const requests = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "ConsumerServiceAssignmentEvent"
        WHERE "assignmentId" = ${assignment.id}::uuid AND "type" = 'COMPLETION_REQUESTED'
        ORDER BY "occurredAt" DESC LIMIT 1
      `);
      if (!requests[0]) throw new BadRequestException('Provider agent has not requested completion');
      const completedRows = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        UPDATE "ConsumerServiceBooking" SET "status" = ${ServiceBookingStatus.COMPLETED}::"ServiceBookingStatus", "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${booking.id}::uuid AND "status" = ${ServiceBookingStatus.IN_PROGRESS}::"ServiceBookingStatus" RETURNING *
      `);
      if (!completedRows[0]) throw new BadRequestException('Booking changed concurrently; retry confirmation');
      const releasedRows = await tx.$queryRaw<AssignmentRow[]>(Prisma.sql`
        UPDATE "ConsumerServiceAssignment" SET "status" = 'RELEASED'::"ConsumerDispatchStatus", "releasedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${assignment.id}::uuid AND "status" = 'ARRIVED'::"ConsumerDispatchStatus"
        RETURNING "id", "bookingId", "providerId", "agentId", "status"
      `);
      if (!releasedRows[0]) throw new BadRequestException('Assignment changed concurrently; retry confirmation');
      const occurredAt = new Date();
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ConsumerServiceBookingEvent" ("id", "bookingId", "actorUserId", "action", "fromStatus", "toStatus", "occurredAt")
        VALUES (${randomUUID()}::uuid, ${booking.id}::uuid, ${userId}::uuid, 'CUSTOMER_CONFIRMED_COMPLETION', ${ServiceBookingStatus.IN_PROGRESS}::"ServiceBookingStatus", ${ServiceBookingStatus.COMPLETED}::"ServiceBookingStatus", ${occurredAt})
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ConsumerServiceAssignmentEvent" ("id", "assignmentId", "actorUserId", "type", "fromStatus", "toStatus", "occurredAt")
        VALUES (${randomUUID()}::uuid, ${assignment.id}::uuid, ${userId}::uuid, 'CUSTOMER_CONFIRMED_COMPLETION', 'ARRIVED'::"ConsumerDispatchStatus", 'RELEASED'::"ConsumerDispatchStatus", ${occurredAt})
      `);
      return completedRows[0];
    });
  }

  private async publishCompletionRequest(bookingId: string, assignmentId: string) {
    const rows = await this.prisma.$queryRaw<CompletionNotificationRow[]>(Prisma.sql`
      SELECT b."userId", b."id" AS "bookingId", o."name" AS "offeringName", p."businessName" AS "providerName", ag."displayName" AS "agentDisplayName"
      FROM "ConsumerServiceBooking" b
      JOIN "ServiceOffering" o ON o."id" = b."offeringId"
      JOIN "ServiceProvider" p ON p."id" = b."providerId"
      JOIN "ConsumerServiceAssignment" a ON a."id" = ${assignmentId}::uuid AND a."bookingId" = b."id"
      JOIN "ConsumerProviderAgent" ag ON ag."id" = a."agentId"
      WHERE b."id" = ${bookingId}::uuid LIMIT 1
    `);
    const row = rows[0];
    if (!row) return;
    await this.push.sendConsumerBookingEvent({ ...row, status: 'COMPLETION_REQUESTED' });
  }

  private async lockOwnedAssignment(tx: Prisma.TransactionClient, assignmentId: string, agentId: string, providerId: string) {
    const rows = await tx.$queryRaw<AssignmentRow[]>(Prisma.sql`
      SELECT "id", "bookingId", "providerId", "agentId", "status" FROM "ConsumerServiceAssignment"
      WHERE "id" = ${assignmentId}::uuid AND "agentId" = ${agentId}::uuid AND "providerId" = ${providerId}::uuid FOR UPDATE
    `);
    if (!rows[0]) throw new NotFoundException('Provider agent assignment not found');
    return rows[0];
  }

  private async lockBooking(tx: Prisma.TransactionClient, bookingId: string) {
    const rows = await tx.$queryRaw<BookingRow[]>(Prisma.sql`
      SELECT "id", "userId", "providerId", "status" FROM "ConsumerServiceBooking" WHERE "id" = ${bookingId}::uuid FOR UPDATE
    `);
    if (!rows[0]) throw new NotFoundException('Consumer booking not found');
    return rows[0];
  }
}
