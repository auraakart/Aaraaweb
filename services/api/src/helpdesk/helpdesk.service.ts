import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
type ResolutionCode = 'FIXED' | 'WORKAROUND' | 'DUPLICATE' | 'NOT_REPRODUCIBLE' | 'REQUEST_WITHDRAWN' | 'OTHER';
type ClosureCode = 'RESOLVED_CONFIRMED' | 'RESIDENT_CONFIRMED' | 'DUPLICATE' | 'INVALID_REQUEST' | 'REQUEST_WITHDRAWN' | 'OTHER';

const RESOLUTION_CODES = new Set<ResolutionCode>(['FIXED', 'WORKAROUND', 'DUPLICATE', 'NOT_REPRODUCIBLE', 'REQUEST_WITHDRAWN', 'OTHER']);
const CLOSURE_CODES = new Set<ClosureCode>(['RESOLVED_CONFIRMED', 'RESIDENT_CONFIRMED', 'DUPLICATE', 'INVALID_REQUEST', 'REQUEST_WITHDRAWN', 'OTHER']);

type TicketRow = {
  id: string;
  societyId: string;
  unitId: string;
  createdById: string;
  title: string;
  description: string;
  category: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  assignedToId: string | null;
  resolutionCode?: ResolutionCode | null;
  closureCode?: ClosureCode | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class HelpdeskService {
  constructor(private readonly prisma: PrismaService) {}

  listMine(societyId: string, userId: string) {
    return this.prisma.$queryRaw<TicketRow[]>(Prisma.sql`
      SELECT ht.*, u."number" AS "unitNumber", b."name" AS "buildingName",
        CASE
          WHEN ht."status" IN ('RESOLVED','CLOSED') AND ht."resolutionDueAt" IS NOT NULL
            THEN CASE WHEN ht."resolvedAt" <= ht."resolutionDueAt" THEN 'MET' ELSE 'RESOLUTION_BREACHED' END
          WHEN ht."status" NOT IN ('RESOLVED','CLOSED') AND ht."resolutionDueAt" IS NOT NULL AND CURRENT_TIMESTAMP > ht."resolutionDueAt" THEN 'RESOLUTION_BREACHED'
          WHEN ht."firstRespondedAt" IS NULL AND ht."firstResponseDueAt" IS NOT NULL AND CURRENT_TIMESTAMP > ht."firstResponseDueAt" THEN 'RESPONSE_BREACHED'
          WHEN ht."firstResponseDueAt" IS NULL THEN 'UNTRACKED'
          ELSE 'ON_TRACK'
        END AS "computedSlaState"
      FROM "HelpdeskTicket" ht
      JOIN "Unit" u ON u."id"=ht."unitId" AND u."societyId"=ht."societyId"
      JOIN "Building" b ON b."id"=u."buildingId"
      WHERE ht."societyId" = ${societyId}::uuid
        AND EXISTS (
          SELECT 1 FROM "UnitOccupancy" uo
          WHERE uo."unitId" = ht."unitId"
            AND uo."societyId" = ${societyId}::uuid
            AND uo."userId" = ${userId}::uuid
            AND uo."active" = true
            AND uo."effectiveFrom" <= CURRENT_TIMESTAMP
            AND (uo."effectiveTo" IS NULL OR uo."effectiveTo" > CURRENT_TIMESTAMP)
        )
      ORDER BY ht."createdAt" DESC
    `);
  }

  async createMine(
    societyId: string,
    userId: string,
    input: { unitId: string; title: string; description: string; category?: string; priority?: TicketPriority },
  ) {
    const title = input.title.trim();
    const description = input.description.trim();
    const category = input.category?.trim() || null;
    const priority = input.priority ?? 'NORMAL';
    if (title.length < 3 || title.length > 120) throw new BadRequestException('Title must be between 3 and 120 characters');
    if (description.length < 5 || description.length > 2000) throw new BadRequestException('Description must be between 5 and 2000 characters');

    const occupancy = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT uo."id"
      FROM "UnitOccupancy" uo
      JOIN "Unit" u ON u."id" = uo."unitId"
      WHERE uo."societyId" = ${societyId}::uuid
        AND uo."userId" = ${userId}::uuid
        AND uo."unitId" = ${input.unitId}::uuid
        AND uo."active" = true
        AND uo."effectiveFrom" <= CURRENT_TIMESTAMP
        AND (uo."effectiveTo" IS NULL OR uo."effectiveTo" > CURRENT_TIMESTAMP)
        AND u."societyId" = ${societyId}::uuid
      LIMIT 1
    `);
    if (!occupancy[0]) throw new NotFoundException('Unit not found');

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<TicketRow[]>(Prisma.sql`
        INSERT INTO "HelpdeskTicket" (
          "societyId", "unitId", "createdById", "title", "description", "category", "priority"
        ) VALUES (
          ${societyId}::uuid, ${input.unitId}::uuid, ${userId}::uuid,
          ${title}, ${description}, ${category}, ${priority}
        )
        RETURNING *
      `);
      const ticket = rows[0];
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "HelpdeskActivity" ("societyId", "ticketId", "actorUserId", "type", "toStatus")
        VALUES (${societyId}::uuid, ${ticket.id}::uuid, ${userId}::uuid, 'CREATED', 'OPEN')
      `);
      return ticket;
    });
  }

  listReview(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT ht.*, u."number" AS "unitNumber", b."name" AS "buildingName", creator."name" AS "createdByName",
             assignee."name" AS "assignedToName", escalated."name" AS "escalatedToName"
      FROM "HelpdeskTicket" ht
      JOIN "Unit" u ON u."id" = ht."unitId"
      JOIN "Building" b ON b."id" = u."buildingId"
      JOIN "User" creator ON creator."id" = ht."createdById"
      LEFT JOIN "User" assignee ON assignee."id" = ht."assignedToId"
      LEFT JOIN "User" escalated ON escalated."id" = ht."escalatedToId"
      WHERE ht."societyId" = ${societyId}::uuid
        AND u."societyId" = ${societyId}::uuid
      ORDER BY CASE ht."priority" WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END,
               ht."createdAt" ASC
    `);
  }

  reviewContext(societyId: string) {
    return this.prisma.$queryRaw<Array<{ id: string; name: string; phone: string }>>(Prisma.sql`
      SELECT DISTINCT u."id", u."name", u."phone"
      FROM "User" u
      JOIN "SocietyMembership" sm ON sm."userId"=u."id"
      WHERE sm."societyId"=${societyId}::uuid AND sm."active"=true
      ORDER BY u."name" ASC
    `);
  }

  async assign(societyId: string, actorUserId: string, ticketId: string, assignedToId: string | null) {
    if (assignedToId) {
      const membership = await this.prisma.societyMembership.findFirst({
        where: { societyId, userId: assignedToId, active: true },
        select: { id: true },
      });
      if (!membership) throw new BadRequestException('Assignee must be an active member of the current society');
    }
    return this.prisma.$transaction(async (tx) => {
      const [current] = await tx.$queryRaw<TicketRow[]>(Prisma.sql`
        SELECT * FROM "HelpdeskTicket"
        WHERE "id"=${ticketId}::uuid AND "societyId"=${societyId}::uuid
        FOR UPDATE
      `);
      if (!current) throw new NotFoundException('Helpdesk ticket not found');
      if (['RESOLVED','CLOSED'].includes(current.status)) throw new BadRequestException('Resolved or closed tickets cannot be reassigned');

      const [updated] = await tx.$queryRaw<TicketRow[]>(Prisma.sql`
        UPDATE "HelpdeskTicket"
        SET "assignedToId"=${assignedToId}::uuid,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${ticketId}::uuid AND "societyId"=${societyId}::uuid
        RETURNING *
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "HelpdeskActivity" ("societyId","ticketId","actorUserId","type","message")
        VALUES (
          ${societyId}::uuid,${ticketId}::uuid,${actorUserId}::uuid,'ASSIGNED',
          ${assignedToId ? `Assigned to ${assignedToId}` : 'Assignment cleared'}
        )
      `);
      return updated;
    });
  }

  async activitiesMine(societyId: string, userId: string, ticketId: string) {
    const ticket = await this.findOwnedTicket(societyId, userId, ticketId);
    if (!ticket) throw new NotFoundException('Helpdesk ticket not found');
    return this.activitiesForTicket(societyId, ticketId, false);
  }

  async activitiesReview(societyId: string, ticketId: string) {
    const ticket = await this.findTicket(societyId, ticketId);
    if (!ticket) throw new NotFoundException('Helpdesk ticket not found');
    return this.activitiesForTicket(societyId, ticketId, true);
  }

  async addComment(societyId: string, userId: string, ticketId: string, message: string, reviewer = false) {
    const normalized = message.trim();
    if (normalized.length < 1 || normalized.length > 1000) throw new BadRequestException('Comment must be between 1 and 1000 characters');
    const access = reviewer
      ? await this.findTicket(societyId, ticketId)
      : await this.findOwnedTicket(societyId, userId, ticketId);
    if (!access) throw new NotFoundException('Helpdesk ticket not found');
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "HelpdeskActivity" ("societyId", "ticketId", "actorUserId", "type", "message")
      VALUES (${societyId}::uuid, ${ticketId}::uuid, ${userId}::uuid, 'COMMENT', ${normalized})
    `);
    return { ok: true };
  }

  async addInternalNote(societyId: string, actorUserId: string, ticketId: string, message: string) {
    const normalized = message.trim();
    if (normalized.length < 1 || normalized.length > 1000) throw new BadRequestException('Internal note must be between 1 and 1000 characters');
    const ticket = await this.findTicket(societyId, ticketId);
    if (!ticket) throw new NotFoundException('Helpdesk ticket not found');
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "HelpdeskActivity" ("societyId", "ticketId", "actorUserId", "type", "message")
      VALUES (${societyId}::uuid, ${ticketId}::uuid, ${actorUserId}::uuid, 'INTERNAL_NOTE', ${normalized})
    `);
    return { ok: true };
  }

  async updateStatus(
    societyId: string,
    actorUserId: string,
    ticketId: string,
    toStatus: TicketStatus,
    note?: string,
    reasonCode?: string,
  ) {
    const current = await this.findTicket(societyId, ticketId);
    if (!current) throw new NotFoundException('Helpdesk ticket not found');
    if (current.status === toStatus) return current;
    if (!this.isTransitionAllowed(current.status, toStatus)) {
      throw new BadRequestException(`Cannot move helpdesk ticket from ${current.status} to ${toStatus}`);
    }
    const normalizedNote = note?.trim() || null;
    if (normalizedNote && normalizedNote.length > 1000) throw new BadRequestException('Status note must be 1000 characters or fewer');

    let resolutionCode: ResolutionCode | null = current.resolutionCode ?? null;
    let closureCode: ClosureCode | null = current.closureCode ?? null;
    if (toStatus === 'RESOLVED') {
      if (!reasonCode || !RESOLUTION_CODES.has(reasonCode as ResolutionCode)) throw new BadRequestException('A valid resolution code is required');
      resolutionCode = reasonCode as ResolutionCode;
      closureCode = null;
    } else if (toStatus === 'CLOSED') {
      if (!reasonCode || !CLOSURE_CODES.has(reasonCode as ClosureCode)) throw new BadRequestException('A valid closure code is required');
      closureCode = reasonCode as ClosureCode;
    }

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<TicketRow[]>(Prisma.sql`
        UPDATE "HelpdeskTicket"
        SET "status" = ${toStatus},
            "resolutionCode" = ${resolutionCode},
            "closureCode" = ${closureCode},
            "resolvedAt" = CASE WHEN ${toStatus} = 'RESOLVED' THEN CURRENT_TIMESTAMP ELSE "resolvedAt" END,
            "closedAt" = CASE WHEN ${toStatus} = 'CLOSED' THEN CURRENT_TIMESTAMP ELSE "closedAt" END,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${ticketId}::uuid
          AND "societyId" = ${societyId}::uuid
          AND "status" = ${current.status}
        RETURNING *
      `);
      const updated = rows[0];
      if (!updated) throw new BadRequestException('Helpdesk ticket changed; refresh and retry');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "HelpdeskActivity" (
          "societyId", "ticketId", "actorUserId", "type", "message", "fromStatus", "toStatus"
        ) VALUES (
          ${societyId}::uuid, ${ticketId}::uuid, ${actorUserId}::uuid,
          'STATUS_CHANGED', ${normalizedNote}, ${current.status}, ${toStatus}
        )
      `);
      return updated;
    });
  }

  async reopen(societyId: string, actorUserId: string, ticketId: string, note: string) {
    const normalized = note.trim();
    if (normalized.length < 3 || normalized.length > 1000) throw new BadRequestException('Reopen reason must be between 3 and 1000 characters');
    return this.prisma.$transaction(async (tx) => {
      const [current] = await tx.$queryRaw<TicketRow[]>(Prisma.sql`
        SELECT * FROM "HelpdeskTicket"
        WHERE "id"=${ticketId}::uuid AND "societyId"=${societyId}::uuid
        FOR UPDATE
      `);
      if (!current) throw new NotFoundException('Helpdesk ticket not found');
      if (!['RESOLVED','CLOSED'].includes(current.status)) throw new BadRequestException('Only resolved or closed tickets can be reopened');
      const [updated] = await tx.$queryRaw<TicketRow[]>(Prisma.sql`
        UPDATE "HelpdeskTicket"
        SET "status"='IN_PROGRESS', "resolvedAt"=NULL, "closedAt"=NULL,
            "resolutionCode"=NULL, "closureCode"=NULL, "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${ticketId}::uuid AND "societyId"=${societyId}::uuid AND "status"=${current.status}
        RETURNING *
      `);
      if (!updated) throw new BadRequestException('Helpdesk ticket changed; refresh and retry');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "HelpdeskActivity" ("societyId","ticketId","actorUserId","type","message","fromStatus","toStatus")
        VALUES (${societyId}::uuid,${ticketId}::uuid,${actorUserId}::uuid,'REOPENED',${normalized},${current.status},'IN_PROGRESS')
      `);
      return updated;
    });
  }

  private activitiesForTicket(societyId: string, ticketId: string, includeInternal: boolean) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT ha.*, actor."name" AS "actorName"
      FROM "HelpdeskActivity" ha
      JOIN "User" actor ON actor."id" = ha."actorUserId"
      WHERE ha."societyId" = ${societyId}::uuid
        AND ha."ticketId" = ${ticketId}::uuid
        AND (${includeInternal} OR ha."type" <> 'INTERNAL_NOTE')
      ORDER BY ha."occurredAt" ASC
    `);
  }

  private async findTicket(societyId: string, ticketId: string) {
    const rows = await this.prisma.$queryRaw<TicketRow[]>(Prisma.sql`
      SELECT * FROM "HelpdeskTicket"
      WHERE "id" = ${ticketId}::uuid AND "societyId" = ${societyId}::uuid
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private async findOwnedTicket(societyId: string, userId: string, ticketId: string) {
    const rows = await this.prisma.$queryRaw<TicketRow[]>(Prisma.sql`
      SELECT ht.*
      FROM "HelpdeskTicket" ht
      WHERE ht."id" = ${ticketId}::uuid
        AND ht."societyId" = ${societyId}::uuid
        AND EXISTS (
          SELECT 1 FROM "UnitOccupancy" uo
          WHERE uo."unitId" = ht."unitId"
            AND uo."societyId" = ${societyId}::uuid
            AND uo."userId" = ${userId}::uuid
            AND uo."active" = true
            AND uo."effectiveFrom" <= CURRENT_TIMESTAMP
            AND (uo."effectiveTo" IS NULL OR uo."effectiveTo" > CURRENT_TIMESTAMP)
        )
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private isTransitionAllowed(from: TicketStatus, to: TicketStatus) {
    const transitions: Record<TicketStatus, readonly TicketStatus[]> = {
      OPEN: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
      IN_PROGRESS: ['OPEN', 'RESOLVED', 'CLOSED'],
      RESOLVED: ['CLOSED'],
      CLOSED: [],
    };
    return transitions[from].includes(to);
  }
}
