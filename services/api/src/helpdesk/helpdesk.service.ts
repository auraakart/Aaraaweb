import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HELPDESK_TICKET_SLA_STATE_SQL } from './helpdesk-sla-state';

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
  idempotencyKey: string | null;
  title: string;
  description: string;
  category: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  assignedToId: string | null;
  assetId?: string | null;
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
        ${HELPDESK_TICKET_SLA_STATE_SQL} AS "computedSlaState"
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
    input: { unitId: string; idempotencyKey: string; title: string; description: string; category?: string; priority?: TicketPriority },
  ) {
    const title = input.title.trim();
    const description = input.description.trim();
    const category = input.category?.trim() || null;
    const priority = input.priority ?? 'NORMAL';
    const idempotencyKey = input.idempotencyKey.trim();
    if (title.length < 3 || title.length > 120) throw new BadRequestException('Title must be between 3 and 120 characters');
    if (description.length < 5 || description.length > 2000) throw new BadRequestException('Description must be between 5 and 2000 characters');
    if (idempotencyKey.length < 8 || idempotencyKey.length > 120) throw new BadRequestException('Idempotency key must be between 8 and 120 characters');

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
      const lockKey = `${societyId}:${userId}:${idempotencyKey}`;
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
      `);
      const [existing] = await tx.$queryRaw<TicketRow[]>(Prisma.sql`
        SELECT * FROM "HelpdeskTicket"
        WHERE "societyId"=${societyId}::uuid
          AND "createdById"=${userId}::uuid
          AND "idempotencyKey"=${idempotencyKey}
        LIMIT 1
      `);
      if (existing) {
        const sameIntent =
          existing.unitId === input.unitId &&
          existing.title === title &&
          existing.description === description &&
          (existing.category ?? null) === category &&
          existing.priority === priority;
        if (!sameIntent) throw new ConflictException('Idempotency key already used for a different complaint');
        return existing;
      }
      const rows = await tx.$queryRaw<TicketRow[]>(Prisma.sql`
        INSERT INTO "HelpdeskTicket" (
          "societyId", "unitId", "createdById", "idempotencyKey", "title", "description", "category", "priority"
        ) VALUES (
          ${societyId}::uuid, ${input.unitId}::uuid, ${userId}::uuid, ${idempotencyKey},
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
             assignee."name" AS "assignedToName", escalated."name" AS "escalatedToName",
             asset."code" AS "assetCode", asset."name" AS "assetName"
      FROM "HelpdeskTicket" ht
      JOIN "Unit" u ON u."id" = ht."unitId"
      JOIN "Building" b ON b."id" = u."buildingId"
      JOIN "User" creator ON creator."id" = ht."createdById"
      LEFT JOIN "User" assignee ON assignee."id" = ht."assignedToId"
      LEFT JOIN "User" escalated ON escalated."id" = ht."escalatedToId"
      LEFT JOIN "FacilityAsset" asset ON asset."id"=ht."assetId" AND asset."societyId"=ht."societyId"
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

  reviewAssets(societyId:string){
    return this.prisma.$queryRaw<Array<{id:string;code:string;name:string;category:string;location:string|null;status:string}>>(Prisma.sql`
      SELECT "id","code","name","category","location","status"
      FROM "FacilityAsset"
      WHERE "societyId"=${societyId}::uuid AND "status"<>'RETIRED'
      ORDER BY CASE "status" WHEN 'ACTIVE' THEN 0 ELSE 1 END,"name"
      LIMIT 500
    `);
  }

  async linkAsset(societyId:string,actorUserId:string,ticketId:string,assetId:string|null){
    return this.prisma.$transaction(async tx=>{
      const [ticket]=await tx.$queryRaw<Array<{id:string;status:string;assetId:string|null}>>(Prisma.sql`
        SELECT "id","status","assetId" FROM "HelpdeskTicket"
        WHERE "id"=${ticketId}::uuid AND "societyId"=${societyId}::uuid
        FOR UPDATE
      `);
      if(!ticket) throw new NotFoundException('Helpdesk ticket not found');
      if(ticket.status==='CLOSED') throw new BadRequestException('Closed tickets cannot change facility asset linkage');
      let assetLabel:string|null=null;
      if(assetId){
        const [asset]=await tx.$queryRaw<Array<{id:string;code:string;name:string}>>(Prisma.sql`
          SELECT "id","code","name" FROM "FacilityAsset"
          WHERE "id"=${assetId}::uuid AND "societyId"=${societyId}::uuid AND "status"<>'RETIRED'
          LIMIT 1
        `);
        if(!asset) throw new BadRequestException('Active or out-of-service facility asset not found');
        assetLabel=`${asset.code} · ${asset.name}`;
      }
      const [updated]=await tx.$queryRaw<TicketRow[]>(Prisma.sql`
        UPDATE "HelpdeskTicket"
        SET "assetId"=${assetId}::uuid,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${ticketId}::uuid AND "societyId"=${societyId}::uuid
        RETURNING *
      `);
      if((ticket.assetId??null)!==(assetId??null)){
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "HelpdeskActivity" ("societyId","ticketId","actorUserId","type","message")
          VALUES (${societyId}::uuid,${ticketId}::uuid,${actorUserId}::uuid,${assetId?'ASSET_LINKED':'ASSET_UNLINKED'},${assetLabel})
        `);
      }
      return updated;
    });
  }

  async triageIntelligence(societyId:string,ticketId:string){
    const [ticket]=await this.prisma.$queryRaw<Array<TicketRow & {unitNumber:string;buildingName:string;assetCode:string|null;assetName:string|null}>>(Prisma.sql`
      SELECT ht.*,u."number" AS "unitNumber",b."name" AS "buildingName",asset."code" AS "assetCode",asset."name" AS "assetName"
      FROM "HelpdeskTicket" ht
      JOIN "Unit" u ON u."id"=ht."unitId" AND u."societyId"=ht."societyId"
      JOIN "Building" b ON b."id"=u."buildingId" AND b."societyId"=ht."societyId"
      LEFT JOIN "FacilityAsset" asset ON asset."id"=ht."assetId" AND asset."societyId"=ht."societyId"
      WHERE ht."id"=${ticketId}::uuid AND ht."societyId"=${societyId}::uuid
      LIMIT 1
    `);
    if(!ticket) throw new NotFoundException('Helpdesk ticket not found');

    const classification=this.classifyTriageText(`${ticket.title} ${ticket.description}`);
    const suggestedCategory=ticket.category?.trim()||classification.category;
    const [recurrenceRows,candidates]=await Promise.all([
      this.prisma.$queryRaw<Array<{recurringCount:number;latestSimilarAt:Date|null}>>(Prisma.sql`
        SELECT COUNT(*)::int AS "recurringCount",MAX("createdAt") AS "latestSimilarAt"
        FROM "HelpdeskTicket"
        WHERE "societyId"=${societyId}::uuid
          AND "id"<>${ticketId}::uuid
          AND "createdAt">=CURRENT_TIMESTAMP-INTERVAL '90 days'
          AND (
            (${ticket.assetId??null}::uuid IS NOT NULL AND "assetId"=${ticket.assetId??null}::uuid)
            OR (
              ${ticket.assetId??null}::uuid IS NULL
              AND "unitId"=${ticket.unitId}::uuid
              AND (
                (${ticket.category}::text IS NOT NULL AND LOWER(TRIM(COALESCE("category",'')))=LOWER(TRIM(${ticket.category})))
                OR
                (${ticket.category}::text IS NULL AND LOWER(TRIM("title"))=LOWER(TRIM(${ticket.title})))
              )
            )
          )
      `),
      this.prisma.$queryRaw<Array<{userId:string;name:string;phone:string;openTickets:number}>>(Prisma.sql`
        SELECT u."id" AS "userId",u."name",u."phone",
          COUNT(ht."id") FILTER (WHERE ht."status" NOT IN ('RESOLVED','CLOSED'))::int AS "openTickets"
        FROM "SocietyMembership" sm
        JOIN "User" u ON u."id"=sm."userId"
        LEFT JOIN "HelpdeskTicket" ht
          ON ht."societyId"=sm."societyId" AND ht."assignedToId"=u."id"
        WHERE sm."societyId"=${societyId}::uuid AND sm."active"=true
        GROUP BY u."id",u."name",u."phone"
        ORDER BY "openTickets" ASC,u."name" ASC
        LIMIT 20
      `),
    ]);

    const recurrence=recurrenceRows[0]??{recurringCount:0,latestSimilarAt:null};
    const lowest=candidates[0];
    const second=candidates[1];
    const recommendedAssignee=
      !ticket.assignedToId
      && lowest
      && (!second||lowest.openTickets<second.openTickets)
        ? {userId:lowest.userId,name:lowest.name,openTickets:lowest.openTickets,reason:'Unique lowest active helpdesk workload among current society members.'}
        : null;

    return {
      ticketId:ticket.id,
      property:`${ticket.buildingName} · ${ticket.unitNumber}`,
      asset:ticket.assetId?{id:ticket.assetId,code:ticket.assetCode,name:ticket.assetName}:null,
      currentCategory:ticket.category,
      suggestedCategory,
      classificationSignals:ticket.category?['EXISTING_CATEGORY_RETAINED']:classification.matchedTerms,
      recurring:{
        scope:ticket.assetId?'SAME_ASSET':'SAME_UNIT_CATEGORY',
        similarLast90Days:recurrence.recurringCount,
        sameUnitSimilarLast90Days:ticket.assetId?0:recurrence.recurringCount,
        sameAssetSimilarLast90Days:ticket.assetId?recurrence.recurringCount:0,
        latestSimilarAt:recurrence.latestSimilarAt,
        recurring:recurrence.recurringCount>0,
      },
      assignment:{
        currentAssigneeId:ticket.assignedToId,
        recommendedAssignee,
        candidates:candidates.slice(0,8),
      },
      classificationApplied:false,
      assignmentApplied:false,
      predictive:false,
      boundary:'Triage intelligence is deterministic advisory evidence. Category and assignment remain explicit operator decisions through the normal helpdesk workflow.',
    };
  }

  async assignmentPreview(societyId:string,ticketId:string,assignedToId:string|null){
    const [ticket]=await this.prisma.$queryRaw<Array<TicketRow & {assignedToName?:string|null;unitNumber:string;buildingName:string}>>(Prisma.sql`
      SELECT ht.*,assignee."name" AS "assignedToName",u."number" AS "unitNumber",b."name" AS "buildingName"
      FROM "HelpdeskTicket" ht
      JOIN "Unit" u ON u."id"=ht."unitId" AND u."societyId"=ht."societyId"
      JOIN "Building" b ON b."id"=u."buildingId" AND b."societyId"=ht."societyId"
      LEFT JOIN "User" assignee ON assignee."id"=ht."assignedToId"
      WHERE ht."id"=${ticketId}::uuid AND ht."societyId"=${societyId}::uuid LIMIT 1
    `);
    if(!ticket) throw new NotFoundException('Helpdesk ticket not found');
    if(['RESOLVED','CLOSED'].includes(ticket.status)) throw new BadRequestException('Resolved or closed tickets cannot be reassigned');
    let targetAssigneeName:string|null=null;
    if(assignedToId){
      const member=await this.prisma.societyMembership.findFirst({where:{societyId,userId:assignedToId,active:true},select:{user:{select:{name:true}}}});
      if(!member) throw new BadRequestException('Assignee must be an active member of the current society');
      targetAssigneeName=member.user.name;
    }
    return {ticketId:ticket.id,title:ticket.title,priority:ticket.priority,status:ticket.status,property:`${ticket.buildingName} · ${ticket.unitNumber}`,currentAssigneeId:ticket.assignedToId,currentAssigneeName:ticket.assignedToName??null,targetAssigneeId:assignedToId,targetAssigneeName,expectedUpdatedAt:ticket.updatedAt.toISOString(),impact:assignedToId?'Assign accountability to the selected active society member.':'Clear the current assignment.',confirmationRequired:true,mutationPerformed:false};
  }

  async assign(societyId: string, actorUserId: string, ticketId: string, assignedToId: string | null, expectedUpdatedAt?:string) {
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
      if(expectedUpdatedAt){
        const expected=new Date(expectedUpdatedAt);
        if(Number.isNaN(expected.getTime())||expected.toISOString()!==current.updatedAt.toISOString()) throw new BadRequestException('Helpdesk ticket changed; refresh the action preview before confirming');
      }

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

  async addComment(
    societyId: string,
    userId: string,
    ticketId: string,
    message: string,
    reviewer = false,
    idempotencyKey?: string,
  ) {
    const normalized = message.trim();
    if (normalized.length < 1 || normalized.length > 1000) throw new BadRequestException('Comment must be between 1 and 1000 characters');
    const normalizedKey = idempotencyKey?.trim() || null;
    if (!reviewer && (!normalizedKey || normalizedKey.length < 8 || normalizedKey.length > 120)) {
      throw new BadRequestException('Idempotency key must be between 8 and 120 characters');
    }
    const access = reviewer
      ? await this.findTicket(societyId, ticketId)
      : await this.findOwnedTicket(societyId, userId, ticketId);
    if (!access) throw new NotFoundException('Helpdesk ticket not found');

    if (reviewer) {
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO "HelpdeskActivity" ("societyId", "ticketId", "actorUserId", "type", "message")
        VALUES (${societyId}::uuid, ${ticketId}::uuid, ${userId}::uuid, 'COMMENT', ${normalized})
      `);
      return { ok: true };
    }

    return this.prisma.$transaction(async (tx) => {
      const lockKey = `helpdesk-comment:${societyId}:${userId}:${normalizedKey}`;
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
      `);
      const [existing] = await tx.$queryRaw<{ ticketId: string; type: string; message: string | null }[]>(Prisma.sql`
        SELECT "ticketId", "type", "message"
        FROM "HelpdeskActivity"
        WHERE "societyId"=${societyId}::uuid
          AND "actorUserId"=${userId}::uuid
          AND "idempotencyKey"=${normalizedKey}
        LIMIT 1
      `);
      if (existing) {
        const sameIntent = existing.type === 'COMMENT' && existing.ticketId === ticketId && (existing.message ?? '') === normalized;
        if (!sameIntent) throw new ConflictException('Idempotency key already used for a different helpdesk comment');
        return { ok: true };
      }
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "HelpdeskActivity" ("societyId", "ticketId", "actorUserId", "type", "message", "idempotencyKey")
        VALUES (${societyId}::uuid, ${ticketId}::uuid, ${userId}::uuid, 'COMMENT', ${normalized}, ${normalizedKey})
      `);
      return { ok: true };
    });
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

  async reopenMine(societyId: string, userId: string, ticketId: string, note: string) {
    const normalized = this.normalizeReopenNote(note);
    return this.prisma.$transaction(async (tx) => {
      const [current] = await tx.$queryRaw<TicketRow[]>(Prisma.sql`
        SELECT ht.* FROM "HelpdeskTicket" ht
        WHERE ht."id"=${ticketId}::uuid
          AND ht."societyId"=${societyId}::uuid
          AND EXISTS (
            SELECT 1 FROM "UnitOccupancy" uo
            WHERE uo."unitId" = ht."unitId"
              AND uo."societyId" = ${societyId}::uuid
              AND uo."userId" = ${userId}::uuid
              AND uo."active" = true
              AND uo."effectiveFrom" <= CURRENT_TIMESTAMP
              AND (uo."effectiveTo" IS NULL OR uo."effectiveTo" > CURRENT_TIMESTAMP)
          )
        FOR UPDATE
      `);
      if (!current) throw new NotFoundException('Helpdesk ticket not found');
      return this.reopenLocked(tx, societyId, userId, ticketId, current, normalized);
    });
  }

  async reopen(societyId: string, actorUserId: string, ticketId: string, note: string) {
    const normalized = this.normalizeReopenNote(note);
    return this.prisma.$transaction(async (tx) => {
      const [current] = await tx.$queryRaw<TicketRow[]>(Prisma.sql`
        SELECT * FROM "HelpdeskTicket"
        WHERE "id"=${ticketId}::uuid AND "societyId"=${societyId}::uuid
        FOR UPDATE
      `);
      if (!current) throw new NotFoundException('Helpdesk ticket not found');
      return this.reopenLocked(tx, societyId, actorUserId, ticketId, current, normalized);
    });
  }

  private normalizeReopenNote(note: string) {
    const normalized = note.trim();
    if (normalized.length < 3 || normalized.length > 1000) {
      throw new BadRequestException('Reopen reason must be between 3 and 1000 characters');
    }
    return normalized;
  }

  private async reopenLocked(
    tx: Prisma.TransactionClient,
    societyId: string,
    actorUserId: string,
    ticketId: string,
    current: TicketRow,
    normalized: string,
  ) {
    if (!['RESOLVED','CLOSED'].includes(current.status)) {
      throw new BadRequestException('Only resolved or closed tickets can be reopened');
    }
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

  private classifyTriageText(value:string){
    const normalized=value.toLowerCase();
    const groups:Array<{category:string;terms:string[]}>= [
      {category:'PLUMBING',terms:['water','leak','pipe','plumbing','tap','drain']},
      {category:'ELECTRICAL',terms:['power','electricity','electrical','light','switch','socket']},
      {category:'LIFT',terms:['lift','elevator']},
      {category:'SECURITY',terms:['security','gate','access','visitor']},
      {category:'HOUSEKEEPING',terms:['cleaning','garbage','waste','housekeeping','trash']},
      {category:'PARKING',terms:['parking','vehicle','car park']},
    ];
    for(const group of groups){
      const matched=group.terms.filter(term=>normalized.includes(term));
      if(matched.length) return {category:group.category,matchedTerms:matched.map(term=>`KEYWORD:${term.toUpperCase().replaceAll(' ','_')}`)};
    }
    return {category:'GENERAL',matchedTerms:['NO_DOMAIN_KEYWORD']};
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
