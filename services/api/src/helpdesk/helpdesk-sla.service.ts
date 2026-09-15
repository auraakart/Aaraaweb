import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
type SlaState = 'UNTRACKED' | 'ON_TRACK' | 'RESPONSE_BREACHED' | 'RESOLUTION_BREACHED' | 'MET';

@Injectable()
export class HelpdeskSlaService {
  constructor(private readonly prisma: PrismaService) {}

  listPolicies(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT p.*, target."name" AS "escalationTargetName"
      FROM "HelpdeskSlaPolicy" p
      LEFT JOIN "User" target ON target."id"=p."escalationTargetUserId"
      WHERE p."societyId"=${societyId}::uuid
      ORDER BY CASE p."priority" WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END
    `);
  }

  async upsertPolicy(societyId: string, actorUserId: string, input: {
    priority: Priority;
    firstResponseMinutes: number;
    resolutionMinutes: number;
    escalationAfterMinutes: number;
    active?: boolean;
    escalationTargetUserId?: string | null;
    automaticEscalationEnabled?: boolean;
  }) {
    if (input.firstResponseMinutes <= 0) throw new BadRequestException('First response SLA must be positive');
    if (input.resolutionMinutes < input.firstResponseMinutes) throw new BadRequestException('Resolution SLA cannot be shorter than first response SLA');
    if (input.escalationAfterMinutes <= 0) throw new BadRequestException('Escalation delay must be positive');
    const escalationTargetUserId = input.escalationTargetUserId ?? null;
    const automaticEscalationEnabled = input.automaticEscalationEnabled ?? false;
    if (automaticEscalationEnabled && !escalationTargetUserId) {
      throw new BadRequestException('Automatic escalation requires an escalation target');
    }
    if (escalationTargetUserId) {
      const membership = await this.prisma.societyMembership.findFirst({
        where: { societyId, userId: escalationTargetUserId, active: true }, select: { id: true },
      });
      if (!membership) throw new BadRequestException('Escalation target must be an active member of the current society');
    }
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO "HelpdeskSlaPolicy" (
        "societyId","priority","firstResponseMinutes","resolutionMinutes","escalationAfterMinutes","active",
        "updatedByUserId","escalationTargetUserId","automaticEscalationEnabled"
      ) VALUES (
        ${societyId}::uuid,${input.priority},${input.firstResponseMinutes},${input.resolutionMinutes},${input.escalationAfterMinutes},
        ${input.active ?? true},${actorUserId}::uuid,${escalationTargetUserId}::uuid,${automaticEscalationEnabled}
      )
      ON CONFLICT ("societyId","priority") DO UPDATE SET
        "firstResponseMinutes"=EXCLUDED."firstResponseMinutes",
        "resolutionMinutes"=EXCLUDED."resolutionMinutes",
        "escalationAfterMinutes"=EXCLUDED."escalationAfterMinutes",
        "active"=EXCLUDED."active",
        "updatedByUserId"=EXCLUDED."updatedByUserId",
        "escalationTargetUserId"=EXCLUDED."escalationTargetUserId",
        "automaticEscalationEnabled"=EXCLUDED."automaticEscalationEnabled",
        "updatedAt"=CURRENT_TIMESTAMP
      RETURNING *
    `);
    return rows[0];
  }

  listQueue(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT ht.*, u."number" AS "unitNumber", b."name" AS "buildingName", creator."name" AS "createdByName",
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
      JOIN "User" creator ON creator."id"=ht."createdById"
      WHERE ht."societyId"=${societyId}::uuid
      ORDER BY
        CASE
          WHEN ht."status" IN ('RESOLVED','CLOSED') AND ht."resolutionDueAt" IS NOT NULL AND ht."resolvedAt" > ht."resolutionDueAt" THEN 0
          WHEN ht."status" NOT IN ('RESOLVED','CLOSED') AND ht."resolutionDueAt" IS NOT NULL AND CURRENT_TIMESTAMP > ht."resolutionDueAt" THEN 0
          WHEN ht."firstRespondedAt" IS NULL AND ht."firstResponseDueAt" IS NOT NULL AND CURRENT_TIMESTAMP > ht."firstResponseDueAt" THEN 1
          ELSE 2
        END,
        ht."resolutionDueAt" NULLS LAST,
        CASE ht."priority" WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END,
        ht."createdAt" ASC
      LIMIT 500
    `);
  }

  async applyPolicy(societyId: string, actorUserId: string, ticketId: string) {
    return this.prisma.$transaction(async (tx) => {
      const [ticket] = await tx.$queryRaw<Array<{ id: string; priority: Priority; createdAt: Date; status: string; slaState: SlaState }>>(Prisma.sql`
        SELECT "id","priority","createdAt","status","slaState" FROM "HelpdeskTicket"
        WHERE "id"=${ticketId}::uuid AND "societyId"=${societyId}::uuid FOR UPDATE
      `);
      if (!ticket) throw new NotFoundException('Helpdesk ticket not found');
      if (['RESOLVED','CLOSED'].includes(ticket.status)) throw new BadRequestException('Closed or resolved tickets cannot have SLA policy reapplied');
      const [policy] = await tx.$queryRaw<Array<{ firstResponseMinutes: number; resolutionMinutes: number }>>(Prisma.sql`
        SELECT "firstResponseMinutes","resolutionMinutes" FROM "HelpdeskSlaPolicy"
        WHERE "societyId"=${societyId}::uuid AND "priority"=${ticket.priority} AND "active"=true LIMIT 1
      `);
      if (!policy) throw new BadRequestException('No active SLA policy exists for this ticket priority');
      const [updated] = await tx.$queryRaw<Array<Record<string, unknown> & { slaState: SlaState }>>(Prisma.sql`
        UPDATE "HelpdeskTicket" SET
          "firstResponseDueAt"="createdAt" + make_interval(mins => ${policy.firstResponseMinutes}),
          "resolutionDueAt"="createdAt" + make_interval(mins => ${policy.resolutionMinutes}),
          "slaState"=CASE
            WHEN CURRENT_TIMESTAMP > "createdAt" + make_interval(mins => ${policy.resolutionMinutes}) THEN 'RESOLUTION_BREACHED'
            WHEN "firstRespondedAt" IS NULL AND CURRENT_TIMESTAMP > "createdAt" + make_interval(mins => ${policy.firstResponseMinutes}) THEN 'RESPONSE_BREACHED'
            ELSE 'ON_TRACK'
          END,
          "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${ticketId}::uuid AND "societyId"=${societyId}::uuid
        RETURNING *
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "HelpdeskSlaEvent" ("societyId","ticketId","actorUserId","eventType","fromState","toState","note")
        VALUES (${societyId}::uuid,${ticketId}::uuid,${actorUserId}::uuid,
          ${ticket.slaState === 'UNTRACKED' ? 'TRACKING_STARTED' : 'POLICY_REAPPLIED'},${ticket.slaState},${updated.slaState},'SLA policy applied')
      `);
      return updated;
    });
  }

  async evaluate(societyId: string, actorUserId: string, ticketId: string) {
    return this.prisma.$transaction(async (tx) => {
      const [ticket] = await tx.$queryRaw<Array<{ id: string; status: string; slaState: SlaState; firstRespondedAt: Date | null; firstResponseDueAt: Date | null; resolutionDueAt: Date | null; resolvedAt: Date | null }>>(Prisma.sql`
        SELECT "id","status","slaState","firstRespondedAt","firstResponseDueAt","resolutionDueAt","resolvedAt"
        FROM "HelpdeskTicket" WHERE "id"=${ticketId}::uuid AND "societyId"=${societyId}::uuid FOR UPDATE
      `);
      if (!ticket) throw new NotFoundException('Helpdesk ticket not found');
      const [calc] = await tx.$queryRaw<Array<{ state: SlaState }>>(Prisma.sql`
        SELECT CASE
          WHEN ${ticket.firstResponseDueAt}::timestamptz IS NULL THEN 'UNTRACKED'
          WHEN ${ticket.status} IN ('RESOLVED','CLOSED') AND ${ticket.resolutionDueAt}::timestamptz IS NOT NULL
            THEN CASE WHEN ${ticket.resolvedAt}::timestamptz <= ${ticket.resolutionDueAt}::timestamptz THEN 'MET' ELSE 'RESOLUTION_BREACHED' END
          WHEN ${ticket.status} NOT IN ('RESOLVED','CLOSED') AND ${ticket.resolutionDueAt}::timestamptz IS NOT NULL AND CURRENT_TIMESTAMP > ${ticket.resolutionDueAt}::timestamptz THEN 'RESOLUTION_BREACHED'
          WHEN ${ticket.firstRespondedAt}::timestamptz IS NULL AND CURRENT_TIMESTAMP > ${ticket.firstResponseDueAt}::timestamptz THEN 'RESPONSE_BREACHED'
          ELSE 'ON_TRACK'
        END::text AS state
      `);
      if (calc.state === ticket.slaState) return { ticketId, slaState: ticket.slaState, changed: false };
      await tx.$executeRaw(Prisma.sql`
        UPDATE "HelpdeskTicket" SET "slaState"=${calc.state},"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${ticketId}::uuid AND "societyId"=${societyId}::uuid
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "HelpdeskSlaEvent" ("societyId","ticketId","actorUserId","eventType","fromState","toState","note")
        VALUES (${societyId}::uuid,${ticketId}::uuid,${actorUserId}::uuid,'STATE_CHANGED',${ticket.slaState},${calc.state},'SLA state evaluated')
      `);
      return { ticketId, slaState: calc.state, changed: true };
    });
  }

  async escalate(societyId: string, actorUserId: string, ticketId: string, escalatedToId: string, note?: string) {
    const membership = await this.prisma.societyMembership.findFirst({
      where: { societyId, userId: escalatedToId, active: true }, select: { id: true },
    });
    if (!membership) throw new BadRequestException('Escalation target must be an active member of the current society');
    return this.prisma.$transaction(async (tx) => {
      const [ticket] = await tx.$queryRaw<Array<{ id: string; status: string; slaState: SlaState; escalationLevel: number }>>(Prisma.sql`
        SELECT "id","status","slaState","escalationLevel" FROM "HelpdeskTicket"
        WHERE "id"=${ticketId}::uuid AND "societyId"=${societyId}::uuid FOR UPDATE
      `);
      if (!ticket) throw new NotFoundException('Helpdesk ticket not found');
      if (['RESOLVED','CLOSED'].includes(ticket.status)) throw new BadRequestException('Resolved or closed tickets cannot be escalated');
      if (!['RESPONSE_BREACHED','RESOLUTION_BREACHED'].includes(ticket.slaState)) throw new BadRequestException('Only breached tickets can be escalated');
      const nextLevel = ticket.escalationLevel + 1;
      await tx.$executeRaw(Prisma.sql`
        UPDATE "HelpdeskTicket" SET "escalationLevel"=${nextLevel},"escalatedToId"=${escalatedToId}::uuid,
          "lastEscalatedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${ticketId}::uuid AND "societyId"=${societyId}::uuid
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "HelpdeskSlaEvent" ("societyId","ticketId","actorUserId","eventType","fromState","toState","escalationLevel","escalatedToId","note")
        VALUES (${societyId}::uuid,${ticketId}::uuid,${actorUserId}::uuid,'ESCALATED',${ticket.slaState},${ticket.slaState},${nextLevel},${escalatedToId}::uuid,${note?.trim()||'Helpdesk SLA escalated'})
      `);
      return { ticketId, escalationLevel: nextLevel, escalatedToId };
    });
  }

  history(societyId: string, ticketId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT e.*,
        CASE WHEN e."actorSource"='AUTOMATION' THEN 'Aaraagate automation' ELSE COALESCE(actor."name", 'Unknown user') END AS "actorName",
        target."name" AS "escalatedToName"
      FROM "HelpdeskSlaEvent" e
      LEFT JOIN "User" actor ON actor."id"=e."actorUserId"
      LEFT JOIN "User" target ON target."id"=e."escalatedToId"
      WHERE e."societyId"=${societyId}::uuid AND e."ticketId"=${ticketId}::uuid
      ORDER BY e."createdAt" ASC
    `);
  }
}
