import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceBookingStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PushNotificationService } from '../notifications/push-notification.service';
import { PrismaService } from '../prisma/prisma.service';

export type ConsumerDispatchStatus = 'ASSIGNED' | 'ACCEPTED' | 'REJECTED' | 'EN_ROUTE' | 'ARRIVED' | 'RELEASED';
type ConsumerDispatchNotificationStatus = 'ASSIGNED' | 'EN_ROUTE' | 'ARRIVED';

export type CreateConsumerProviderAgentInput = {
  displayName: string;
  phone?: string;
  externalRef?: string;
};

type AgentRow = {
  id: string;
  providerId: string;
  displayName: string;
  phone: string | null;
  externalRef: string | null;
  active: boolean;
};

type BookingRow = {
  id: string;
  userId: string;
  providerId: string;
  status: ServiceBookingStatus;
};

type AssignmentRow = {
  id: string;
  bookingId: string;
  providerId: string;
  agentId: string;
  assignedByUserId: string;
  status: ConsumerDispatchStatus;
  assignedAt: Date;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  enRouteAt: Date | null;
  arrivedAt: Date | null;
  releasedAt: Date | null;
};

type DispatchNotificationRow = {
  bookingId: string;
  userId: string;
  offeringName: string;
  providerName: string;
  agentDisplayName: string;
};

const ACTIVE_STATUSES: readonly ConsumerDispatchStatus[] = ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'];

const ALLOWED_TRANSITIONS: Readonly<Record<ConsumerDispatchStatus, readonly ConsumerDispatchStatus[]>> = {
  ASSIGNED: ['ACCEPTED', 'REJECTED', 'RELEASED'],
  ACCEPTED: ['EN_ROUTE', 'RELEASED'],
  REJECTED: [],
  EN_ROUTE: ['ARRIVED', 'RELEASED'],
  ARRIVED: ['RELEASED'],
  RELEASED: [],
};

@Injectable()
export class ConsumerDispatchService {
  private readonly logger = new Logger(ConsumerDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushNotificationService,
  ) {}

  listAgents(providerId: string) {
    return this.prisma.$queryRaw<AgentRow[]>(Prisma.sql`
      SELECT a.*
      FROM "ConsumerProviderAgent" a
      WHERE a."providerId" = ${providerId}::uuid
      ORDER BY a."active" DESC, a."createdAt" DESC
    `);
  }

  async createAgent(providerId: string, input: CreateConsumerProviderAgentInput) {
    const displayName = input.displayName.trim();
    if (!displayName) throw new BadRequestException('Agent display name is required');
    const providers = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "ServiceProvider"
      WHERE "id" = ${providerId}::uuid AND "active" = true AND "verification" = 'VERIFIED'::"ProviderVerificationStatus"
      LIMIT 1
    `);
    if (!providers[0]) throw new NotFoundException('Verified active service provider not found');

    const rows = await this.prisma.$queryRaw<AgentRow[]>(Prisma.sql`
      INSERT INTO "ConsumerProviderAgent" (
        "id", "providerId", "displayName", "phone", "externalRef", "active", "createdAt", "updatedAt"
      ) VALUES (
        ${randomUUID()}::uuid,
        ${providerId}::uuid,
        ${displayName},
        ${input.phone?.trim() || null},
        ${input.externalRef?.trim() || null},
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      RETURNING *
    `);
    return rows[0];
  }

  async setAgentActive(providerId: string, agentId: string, active: boolean) {
    if (!active) {
      const assignments = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "ConsumerServiceAssignment"
        WHERE "agentId" = ${agentId}::uuid AND "providerId" = ${providerId}::uuid
          AND "status" IN ('ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED')
        LIMIT 1
      `);
      if (assignments[0]) throw new BadRequestException('Agent has an active consumer assignment');
    }
    const rows = await this.prisma.$queryRaw<AgentRow[]>(Prisma.sql`
      UPDATE "ConsumerProviderAgent"
      SET "active" = ${active}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${agentId}::uuid AND "providerId" = ${providerId}::uuid
      RETURNING *
    `);
    if (!rows[0]) throw new NotFoundException('Provider agent not found');
    return rows[0];
  }

  listAssignments(bookingId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT a.*, ag."displayName" AS "agentDisplayName", ag."phone" AS "agentPhone", ag."externalRef" AS "agentExternalRef"
      FROM "ConsumerServiceAssignment" a
      JOIN "ConsumerProviderAgent" ag ON ag."id" = a."agentId" AND ag."providerId" = a."providerId"
      WHERE a."bookingId" = ${bookingId}::uuid
      ORDER BY a."createdAt" DESC
    `);
  }

  async listAssignmentEvents(assignmentId: string) {
    const assignment = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "ConsumerServiceAssignment" WHERE "id" = ${assignmentId}::uuid LIMIT 1
    `);
    if (!assignment[0]) throw new NotFoundException('Consumer assignment not found');
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT * FROM "ConsumerServiceAssignmentEvent"
      WHERE "assignmentId" = ${assignmentId}::uuid
      ORDER BY "occurredAt" ASC
    `);
  }

  async getConsumerDispatch(userId: string, bookingId: string) {
    const bookings = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "ConsumerServiceBooking"
      WHERE "id" = ${bookingId}::uuid AND "userId" = ${userId}::uuid
      LIMIT 1
    `);
    if (!bookings[0]) throw new NotFoundException('Booking not found');

    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
        a."id" AS "assignmentId",
        a."status",
        a."assignedAt",
        a."acceptedAt",
        a."enRouteAt",
        a."arrivedAt",
        ag."displayName" AS "agentDisplayName",
        p."businessName" AS "providerName"
      FROM "ConsumerServiceAssignment" a
      JOIN "ConsumerProviderAgent" ag ON ag."id" = a."agentId" AND ag."providerId" = a."providerId"
      JOIN "ServiceProvider" p ON p."id" = a."providerId"
      WHERE a."bookingId" = ${bookingId}::uuid
        AND a."status" IN ('ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED')
      ORDER BY a."createdAt" DESC
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  async assign(actorUserId: string, bookingId: string, agentId: string) {
    const assignment = await this.prisma.$transaction(async (tx) => {
      const bookingRows = await tx.$queryRaw<BookingRow[]>(Prisma.sql`
        SELECT "id", "userId", "providerId", "status"
        FROM "ConsumerServiceBooking"
        WHERE "id" = ${bookingId}::uuid
        FOR UPDATE
      `);
      const booking = bookingRows[0];
      if (!booking) throw new NotFoundException('Consumer booking not found');
      if (booking.status !== ServiceBookingStatus.CONFIRMED) {
        throw new BadRequestException('Only confirmed consumer bookings can be assigned');
      }

      const activeRows = await tx.$queryRaw<AssignmentRow[]>(Prisma.sql`
        SELECT * FROM "ConsumerServiceAssignment"
        WHERE "bookingId" = ${bookingId}::uuid
          AND "status" IN ('ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED')
        LIMIT 1
        FOR UPDATE
      `);
      if (activeRows[0]) throw new BadRequestException('Consumer booking already has an active assignment');

      const agents = await tx.$queryRaw<AgentRow[]>(Prisma.sql`
        SELECT ag.*
        FROM "ConsumerProviderAgent" ag
        JOIN "ServiceProvider" p ON p."id" = ag."providerId"
        WHERE ag."id" = ${agentId}::uuid
          AND ag."providerId" = ${booking.providerId}::uuid
          AND ag."active" = true
          AND p."active" = true
          AND p."verification" = 'VERIFIED'::"ProviderVerificationStatus"
        LIMIT 1
        FOR UPDATE OF ag
      `);
      const agent = agents[0];
      if (!agent) throw new BadRequestException('Selected agent is not active for the booking provider');

      const assignmentId = randomUUID();
      const rows = await tx.$queryRaw<AssignmentRow[]>(Prisma.sql`
        INSERT INTO "ConsumerServiceAssignment" (
          "id", "bookingId", "providerId", "agentId", "assignedByUserId", "status", "assignedAt", "createdAt", "updatedAt"
        ) VALUES (
          ${assignmentId}::uuid,
          ${bookingId}::uuid,
          ${booking.providerId}::uuid,
          ${agentId}::uuid,
          ${actorUserId}::uuid,
          'ASSIGNED'::"ConsumerDispatchStatus",
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        RETURNING *
      `);
      const created = rows[0];
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ConsumerServiceAssignmentEvent" (
          "id", "assignmentId", "actorUserId", "type", "fromStatus", "toStatus", "occurredAt"
        ) VALUES (
          ${randomUUID()}::uuid,
          ${created.id}::uuid,
          ${actorUserId}::uuid,
          'ASSIGNED',
          NULL,
          'ASSIGNED'::"ConsumerDispatchStatus",
          CURRENT_TIMESTAMP
        )
      `);
      return created;
    });

    this.publishDispatchStatus(assignment.id, 'ASSIGNED');
    return assignment;
  }

  async transition(actorUserId: string, assignmentId: string, toStatus: ConsumerDispatchStatus, note?: string) {
    const assignment = await this.prisma.$transaction(async (tx) => {
      const currentRows = await tx.$queryRaw<AssignmentRow[]>(Prisma.sql`
        SELECT * FROM "ConsumerServiceAssignment"
        WHERE "id" = ${assignmentId}::uuid
        FOR UPDATE
      `);
      const current = currentRows[0];
      if (!current) throw new NotFoundException('Consumer assignment not found');
      if (!ALLOWED_TRANSITIONS[current.status].includes(toStatus)) {
        throw new BadRequestException(`Invalid dispatch transition from ${current.status} to ${toStatus}`);
      }

      const timestampColumn = this.timestampColumn(toStatus);
      const rows = await tx.$queryRaw<AssignmentRow[]>(Prisma.sql`
        UPDATE "ConsumerServiceAssignment"
        SET
          "status" = ${toStatus}::"ConsumerDispatchStatus",
          ${Prisma.raw(`"${timestampColumn}"`)} = CURRENT_TIMESTAMP,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${assignmentId}::uuid AND "status" = ${current.status}::"ConsumerDispatchStatus"
        RETURNING *
      `);
      if (!rows[0]) throw new BadRequestException('Assignment changed concurrently; retry the action');

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ConsumerServiceAssignmentEvent" (
          "id", "assignmentId", "actorUserId", "type", "fromStatus", "toStatus", "note", "occurredAt"
        ) VALUES (
          ${randomUUID()}::uuid,
          ${assignmentId}::uuid,
          ${actorUserId}::uuid,
          ${toStatus},
          ${current.status}::"ConsumerDispatchStatus",
          ${toStatus}::"ConsumerDispatchStatus",
          ${note?.trim() || null},
          CURRENT_TIMESTAMP
        )
      `);
      return rows[0];
    });

    if (toStatus === 'EN_ROUTE' || toStatus === 'ARRIVED') this.publishDispatchStatus(assignment.id, toStatus);
    return assignment;
  }

  private publishDispatchStatus(assignmentId: string, status: ConsumerDispatchNotificationStatus) {
    void this.loadDispatchNotification(assignmentId)
      .then((event) => event && this.push.sendConsumerBookingEvent({ ...event, status }))
      .catch((error: unknown) => {
        this.logger.warn(`Consumer dispatch push failed for ${assignmentId}: ${error instanceof Error ? error.message : 'unknown error'}`);
      });
  }

  private async loadDispatchNotification(assignmentId: string) {
    const rows = await this.prisma.$queryRaw<DispatchNotificationRow[]>(Prisma.sql`
      SELECT
        b."id" AS "bookingId",
        b."userId",
        o."name" AS "offeringName",
        p."businessName" AS "providerName",
        ag."displayName" AS "agentDisplayName"
      FROM "ConsumerServiceAssignment" a
      JOIN "ConsumerServiceBooking" b ON b."id" = a."bookingId"
      JOIN "ServiceOffering" o ON o."id" = b."offeringId"
      JOIN "ServiceProvider" p ON p."id" = a."providerId"
      JOIN "ConsumerProviderAgent" ag ON ag."id" = a."agentId" AND ag."providerId" = a."providerId"
      WHERE a."id" = ${assignmentId}::uuid
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private timestampColumn(status: ConsumerDispatchStatus) {
    switch (status) {
      case 'ACCEPTED': return 'acceptedAt';
      case 'REJECTED': return 'rejectedAt';
      case 'EN_ROUTE': return 'enRouteAt';
      case 'ARRIVED': return 'arrivedAt';
      case 'RELEASED': return 'releasedAt';
      default: throw new BadRequestException('Unsupported dispatch transition');
    }
  }

  isActive(status: ConsumerDispatchStatus) {
    return ACTIVE_STATUSES.includes(status);
  }
}
