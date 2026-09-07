import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerDispatchService, ConsumerDispatchStatus } from './consumer-dispatch.service';

type AgentIdentityRow = {
  identityId: string;
  agentId: string;
  userId: string;
  providerId: string;
  displayName: string;
  businessName: string;
};

const AGENT_TRANSITIONS: readonly ConsumerDispatchStatus[] = ['ACCEPTED', 'REJECTED', 'EN_ROUTE', 'ARRIVED'];

@Injectable()
export class ConsumerProviderAgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatch: ConsumerDispatchService,
  ) {}

  async resolveAgent(userId: string) {
    const rows = await this.prisma.$queryRaw<AgentIdentityRow[]>(Prisma.sql`
      SELECT i."id" AS "identityId", i."agentId", i."userId", a."providerId", a."displayName", p."businessName"
      FROM "ConsumerProviderAgentIdentity" i
      JOIN "ConsumerProviderAgent" a ON a."id" = i."agentId"
      JOIN "ServiceProvider" p ON p."id" = a."providerId"
      WHERE i."userId" = ${userId}::uuid
        AND i."active" = true
        AND a."active" = true
        AND p."active" = true
        AND p."verification" = 'VERIFIED'::"ProviderVerificationStatus"
      ORDER BY i."createdAt" ASC
      LIMIT 2
    `);
    if (rows.length !== 1) throw new ForbiddenException('Provider agent access is not available');
    return rows[0];
  }

  async linkAgent(agentId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const users = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE
      `);
      if (!users[0]) throw new NotFoundException('User not found');

      const agents = await tx.$queryRaw<Array<{ id: string; providerId: string }>>(Prisma.sql`
        SELECT a."id", a."providerId"
        FROM "ConsumerProviderAgent" a
        JOIN "ServiceProvider" p ON p."id" = a."providerId"
        WHERE a."id" = ${agentId}::uuid
          AND a."active" = true
          AND p."active" = true
          AND p."verification" = 'VERIFIED'::"ProviderVerificationStatus"
        FOR UPDATE OF a
      `);
      if (!agents[0]) throw new NotFoundException('Active provider agent not found');

      const existing = await tx.$queryRaw<Array<{ id: string; agentId: string; userId: string }>>(Prisma.sql`
        SELECT "id", "agentId", "userId"
        FROM "ConsumerProviderAgentIdentity"
        WHERE "active" = true AND ("userId" = ${userId}::uuid OR "agentId" = ${agentId}::uuid)
        FOR UPDATE
      `);
      const same = existing.find(row => row.userId === userId && row.agentId === agentId);
      if (same && existing.length === 1) return same;
      if (existing.some(row => row.userId === userId && row.agentId !== agentId)) {
        throw new BadRequestException('User is already linked to another active provider agent');
      }
      if (existing.some(row => row.agentId === agentId && row.userId !== userId)) {
        throw new BadRequestException('Provider agent is already linked to another active user');
      }

      const rows = await tx.$queryRaw<Array<{ id: string; agentId: string; userId: string; active: boolean }>>(Prisma.sql`
        INSERT INTO "ConsumerProviderAgentIdentity" ("id", "agentId", "userId", "active", "createdAt", "updatedAt")
        VALUES (${randomUUID()}::uuid, ${agentId}::uuid, ${userId}::uuid, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING "id", "agentId", "userId", "active"
      `);
      return rows[0];
    });
  }

  async revokeAgent(agentId: string, userId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; agentId: string; userId: string; active: boolean }>>(Prisma.sql`
      UPDATE "ConsumerProviderAgentIdentity"
      SET "active" = false, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "agentId" = ${agentId}::uuid AND "userId" = ${userId}::uuid AND "active" = true
      RETURNING "id", "agentId", "userId", "active"
    `);
    if (!rows[0]) throw new NotFoundException('Active provider agent identity not found');
    return rows[0];
  }

  async listMyAssignments(userId: string) {
    const agent = await this.resolveAgent(userId);
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT
        a."id",
        a."bookingId",
        a."status",
        a."assignedAt",
        a."acceptedAt",
        a."rejectedAt",
        a."enRouteAt",
        a."arrivedAt",
        a."releasedAt",
        b."offeringName",
        b."addressSnapshot",
        b."scheduledFrom",
        b."scheduledUntil",
        b."notes"
      FROM "ConsumerServiceAssignment" a
      JOIN "ConsumerServiceBooking" b ON b."id" = a."bookingId"
      WHERE a."agentId" = ${agent.agentId}::uuid
        AND a."providerId" = ${agent.providerId}::uuid
      ORDER BY
        CASE WHEN a."status" IN ('ASSIGNED','ACCEPTED','EN_ROUTE','ARRIVED') THEN 0 ELSE 1 END,
        b."scheduledFrom" ASC,
        a."createdAt" DESC
    `);
  }

  async listMyAssignmentEvents(userId: string, assignmentId: string) {
    await this.assertAssignmentOwned(userId, assignmentId);
    return this.dispatch.listAssignmentEvents(assignmentId);
  }

  async transitionMyAssignment(
    userId: string,
    assignmentId: string,
    status: ConsumerDispatchStatus,
    note?: string,
  ) {
    if (!AGENT_TRANSITIONS.includes(status)) {
      throw new BadRequestException('Provider agent cannot perform this dispatch transition');
    }
    await this.assertAssignmentOwned(userId, assignmentId);
    return this.dispatch.transition(userId, assignmentId, status, note);
  }

  private async assertAssignmentOwned(userId: string, assignmentId: string) {
    const agent = await this.resolveAgent(userId);
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "ConsumerServiceAssignment"
      WHERE "id" = ${assignmentId}::uuid
        AND "agentId" = ${agent.agentId}::uuid
        AND "providerId" = ${agent.providerId}::uuid
      LIMIT 1
    `);
    if (!rows[0]) throw new NotFoundException('Provider agent assignment not found');
  }
}
