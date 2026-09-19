import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PrivacyRequestType = 'ACCESS' | 'CORRECTION' | 'ERASURE' | 'OTHER';
type PrivacyCaseStatus = 'OPEN' | 'IN_REVIEW' | 'WAITING' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';

type PrivacyCaseRow = {
  id: string;
  societyId: string | null;
  subjectUserId: string;
  requestType: PrivacyRequestType;
  status: PrivacyCaseStatus;
  requestSummary: string;
  assignedToUserId: string | null;
  legalHold: boolean;
  retentionReason: string | null;
  retentionDecision: 'ALLOW' | 'BLOCK' | null;
  retentionDecisionReason: string | null;
  retentionReviewedAt: Date | null;
  retentionReviewedByUserId: string | null;
  dueAt: Date | null;
  closedAt: Date | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  requestKey?: string | null;
};

const TERMINAL_STATUSES: readonly PrivacyCaseStatus[] = ['COMPLETED', 'REJECTED', 'CANCELLED'];

@Injectable()
export class PrivacyService {
  constructor(private readonly prisma: PrismaService) {}

  listMine(userId: string, societyId?: string) {
    return this.prisma.$queryRaw<Array<Pick<PrivacyCaseRow, 'id' | 'requestType' | 'status' | 'requestSummary' | 'legalHold' | 'dueAt' | 'closedAt' | 'createdAt' | 'updatedAt'>>>(Prisma.sql`
      SELECT "id","requestType","status","requestSummary","legalHold","dueAt","closedAt","createdAt","updatedAt"
      FROM "PrivacyRequestCase"
      WHERE "subjectUserId"=${userId}::uuid
        AND "societyId" IS NOT DISTINCT FROM ${societyId ?? null}::uuid
      ORDER BY "createdAt" DESC
      LIMIT 100
    `);
  }

  async createMine(
    userId: string,
    societyId: string | undefined,
    input: { requestType: 'ACCESS' | 'CORRECTION' | 'ERASURE'; requestSummary: string; requestKey: string },
  ) {
    const summary = input.requestSummary.trim();
    const requestKey = input.requestKey.trim();
    if (!summary) throw new BadRequestException('Privacy request summary is required');
    if (!requestKey) throw new BadRequestException('Privacy request key is required');

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${requestKey}`}))`);
      const existingRows = await tx.$queryRaw<PrivacyCaseRow[]>(Prisma.sql`
        SELECT *
        FROM "PrivacyRequestCase"
        WHERE "subjectUserId"=${userId}::uuid AND "requestKey"=${requestKey}
        LIMIT 1
      `);
      const existing = existingRows[0];
      if (existing) {
        const sameContext = existing.societyId === (societyId ?? null);
        const samePayload = sameContext && existing.requestType === input.requestType && existing.requestSummary === summary;
        if (!samePayload) throw new ConflictException('Privacy request key is already used for another request');
        return existing;
      }

      const rows = await tx.$queryRaw<PrivacyCaseRow[]>(Prisma.sql`
        INSERT INTO "PrivacyRequestCase" (
          "societyId","subjectUserId","requestType","requestSummary","createdByUserId","requestKey"
        ) VALUES (
          ${societyId ?? null}::uuid,${userId}::uuid,${input.requestType},${summary},${userId}::uuid,${requestKey}
        )
        RETURNING *
      `);
      const privacyCase = rows[0];
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PrivacyRequestEvent" (
          "societyId","caseId","actorUserId","eventType","summary","metadataJson"
        ) VALUES (
          ${societyId ?? null}::uuid,${privacyCase.id}::uuid,${userId}::uuid,
          'SELF_SERVICE_CREATED','Privacy request created by the data subject',
          ${JSON.stringify({ requestType: input.requestType })}::jsonb
        )
      `);
      return privacyCase;
    }).catch((error) => {
      if (error instanceof ConflictException || error instanceof BadRequestException) throw error;
      if (this.isUniqueViolation(error)) throw new ConflictException('Privacy request key already exists');
      throw error;
    });
  }

  operatorContext(societyId: string) {
    return Promise.all([
      this.prisma.$queryRaw<Array<{ id: string; name: string; phone: string; relationship: string }>>(Prisma.sql`
        SELECT DISTINCT u."id", u."name", u."phone",
          CASE
            WHEN EXISTS (
              SELECT 1 FROM "UnitOwnership" own
              WHERE own."societyId"=${societyId}::uuid AND own."userId"=u."id" AND own."active"=true
            ) THEN 'OWNER'
            WHEN EXISTS (
              SELECT 1 FROM "UnitOccupancy" occ
              WHERE occ."societyId"=${societyId}::uuid AND occ."userId"=u."id" AND occ."active"=true AND occ."relation"='TENANT'
            ) THEN 'TENANT'
            ELSE 'MEMBER'
          END AS "relationship"
        FROM "User" u
        WHERE EXISTS (
          SELECT 1 FROM "SocietyMembership" sm
          WHERE sm."societyId"=${societyId}::uuid AND sm."userId"=u."id" AND sm."active"=true
        )
        OR EXISTS (
          SELECT 1 FROM "UnitOwnership" own
          WHERE own."societyId"=${societyId}::uuid AND own."userId"=u."id" AND own."active"=true
        )
        OR EXISTS (
          SELECT 1 FROM "UnitOccupancy" occ
          WHERE occ."societyId"=${societyId}::uuid AND occ."userId"=u."id" AND occ."active"=true
        )
        ORDER BY u."name" ASC
      `),
      this.prisma.$queryRaw<Array<{ id: string; name: string; phone: string }>>(Prisma.sql`
        SELECT DISTINCT u."id", u."name", u."phone"
        FROM "User" u
        JOIN "SocietyMembership" sm ON sm."userId"=u."id"
        WHERE sm."societyId"=${societyId}::uuid AND sm."active"=true
        ORDER BY u."name" ASC
      `)
    ]).then(([subjects, assignees]) => ({ subjects, assignees }));
  }

  async caseReadiness(societyId: string, caseId: string) {
    const current = await this.findCase(societyId, caseId);
    if (!current) throw new NotFoundException('Privacy request case not found');

    const [categoryRows, processorRows, incidentRows, grievanceRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
        SELECT COUNT(*)::int AS "count" FROM "PrivacyDataCategory"
        WHERE "societyId"=${societyId}::uuid AND "active"=true
      `),
      this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
        SELECT COUNT(*)::int AS "count" FROM "PrivacyProcessorRegister"
        WHERE "societyId"=${societyId}::uuid AND "active"=true
      `),
      this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
        SELECT COUNT(*)::int AS "count" FROM "PrivacySecurityIncident"
        WHERE "societyId"=${societyId}::uuid AND "status"<>'CLOSED'
      `),
      this.prisma.$queryRaw<Array<{ active: boolean }>>(Prisma.sql`
        SELECT "active" FROM "PrivacyGrievanceContact"
        WHERE "societyId"=${societyId}::uuid LIMIT 1
      `),
    ]);

    const terminal = TERMINAL_STATUSES.includes(current.status);
    const blockers: string[] = [];
    if (!terminal && !current.assignedToUserId) blockers.push('ASSIGNEE_MISSING');
    if (!terminal && current.dueAt && current.dueAt.getTime() < Date.now()) blockers.push('CASE_OVERDUE');
    if (current.requestType === 'ERASURE') {
      if (current.legalHold) blockers.push('LEGAL_HOLD_ACTIVE');
      if (current.retentionDecision !== 'ALLOW') blockers.push('RETENTION_REVIEW_NOT_ALLOWED');
    }

    const nextActions: string[] = [];
    if (blockers.includes('ASSIGNEE_MISSING')) nextActions.push('Assign an active society member to own the case.');
    if (blockers.includes('CASE_OVERDUE')) nextActions.push('Review the overdue case and record the current handling status.');
    if (blockers.includes('LEGAL_HOLD_ACTIVE')) nextActions.push('Resolve the documented legal/retention hold before erasure execution.');
    if (blockers.includes('RETENTION_REVIEW_NOT_ALLOWED')) nextActions.push('Record an explicit retention review before erasure execution.');
    if (!terminal && blockers.length === 0) nextActions.push('Continue case review and record evidence before closing the request.');

    return {
      caseId,
      requestType: current.requestType,
      status: current.status,
      assigned: !!current.assignedToUserId,
      dueAt: current.dueAt,
      overdue: !terminal && !!current.dueAt && current.dueAt.getTime() < Date.now(),
      blockers,
      nextActions,
      privacyProgramContext: {
        activeDataCategories: categoryRows[0]?.count ?? 0,
        activeProcessors: processorRows[0]?.count ?? 0,
        openSecurityIncidents: incidentRows[0]?.count ?? 0,
        grievanceContactActive: grievanceRows[0]?.active ?? false,
      },
      boundary: 'Operational readiness evidence only; this does not determine statutory rights, legal validity or jurisdiction-specific compliance.',
    };
  }

  listCases(societyId: string) {
    return this.prisma.$queryRaw<PrivacyCaseRow[]>(Prisma.sql`
      SELECT pc.*, subject."name" AS "subjectName", subject."phone" AS "subjectPhone",
             assignee."name" AS "assignedToName"
      FROM "PrivacyRequestCase" pc
      JOIN "User" subject ON subject."id" = pc."subjectUserId"
      LEFT JOIN "User" assignee ON assignee."id" = pc."assignedToUserId"
      WHERE pc."societyId" = ${societyId}::uuid
      ORDER BY
        CASE pc."status" WHEN 'OPEN' THEN 0 WHEN 'IN_REVIEW' THEN 1 WHEN 'WAITING' THEN 2 ELSE 3 END,
        pc."createdAt" DESC
      LIMIT 250
    `);
  }

  async createCase(
    societyId: string,
    actorUserId: string,
    input: {
      subjectUserId: string;
      requestType: PrivacyRequestType;
      requestSummary: string;
      assignedToUserId?: string;
      dueAt?: string;
    },
  ) {
    await this.assertSocietySubjectRelationship(societyId, input.subjectUserId);
    if (input.assignedToUserId) {
      await this.assertActiveSocietyMember(societyId, input.assignedToUserId, 'Privacy case assignee');
    }
    const summary = input.requestSummary.trim();
    if (!summary) throw new BadRequestException('Privacy request summary is required');
    const dueAt = input.dueAt ? new Date(input.dueAt) : null;

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<PrivacyCaseRow[]>(Prisma.sql`
        INSERT INTO "PrivacyRequestCase" (
          "societyId", "subjectUserId", "requestType", "requestSummary",
          "assignedToUserId", "dueAt", "createdByUserId"
        ) VALUES (
          ${societyId}::uuid,
          ${input.subjectUserId}::uuid,
          ${input.requestType},
          ${summary},
          ${input.assignedToUserId ?? null}::uuid,
          ${dueAt},
          ${actorUserId}::uuid
        )
        RETURNING *
      `);
      const privacyCase = rows[0];
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PrivacyRequestEvent" (
          "societyId", "caseId", "actorUserId", "eventType", "summary", "metadataJson"
        ) VALUES (
          ${societyId}::uuid,
          ${privacyCase.id}::uuid,
          ${actorUserId}::uuid,
          'CASE_CREATED',
          'Privacy request case created',
          ${JSON.stringify({ requestType: input.requestType })}::jsonb
        )
      `);
      return privacyCase;
    });
  }

  listPlatformCases() {
    return this.prisma.$queryRaw<PrivacyCaseRow[]>(Prisma.sql`
      SELECT pc.*, subject."name" AS "subjectName", subject."phone" AS "subjectPhone",
             assignee."name" AS "assignedToName"
      FROM "PrivacyRequestCase" pc
      JOIN "User" subject ON subject."id" = pc."subjectUserId"
      LEFT JOIN "User" assignee ON assignee."id" = pc."assignedToUserId"
      WHERE pc."societyId" IS NULL
      ORDER BY
        CASE pc."status" WHEN 'OPEN' THEN 0 WHEN 'IN_REVIEW' THEN 1 WHEN 'WAITING' THEN 2 ELSE 3 END,
        pc."createdAt" DESC
      LIMIT 250
    `);
  }

  async updateStatus(
    societyId: string | undefined,
    actorUserId: string,
    caseId: string,
    status: PrivacyCaseStatus,
    note?: string,
  ) {
    const current = await this.findCase(societyId, caseId);
    if (!current) throw new NotFoundException('Privacy request case not found');
    if (TERMINAL_STATUSES.includes(current.status)) {
      if (current.status === status) return current;
      throw new BadRequestException('Closed privacy request cases cannot change status');
    }
    if (status === 'COMPLETED' && current.requestType === 'ERASURE') {
      if (current.legalHold) {
        throw new BadRequestException('Erasure case cannot be completed while legal hold is active');
      }
      if (current.retentionDecision !== 'ALLOW') {
        throw new BadRequestException('Erasure case cannot be completed until retention review allows completion');
      }
    }
    const closedAt = TERMINAL_STATUSES.includes(status) ? new Date() : null;
    const cleanNote = note?.trim() || 'Privacy case status updated';

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<PrivacyCaseRow[]>(Prisma.sql`
        UPDATE "PrivacyRequestCase"
        SET "status" = ${status},
            "closedAt" = ${closedAt},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${caseId}::uuid
          AND "societyId" IS NOT DISTINCT FROM ${societyId ?? null}::uuid
          AND "status" = ${current.status}
          AND "legalHold" = ${current.legalHold}
          AND "retentionDecision" IS NOT DISTINCT FROM ${current.retentionDecision}
        RETURNING *
      `);
      const updated = rows[0];
      if (!updated) throw new BadRequestException('Privacy request case changed; refresh and retry');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PrivacyRequestEvent" (
          "societyId", "caseId", "actorUserId", "eventType", "summary", "metadataJson"
        ) VALUES (
          ${societyId ?? null}::uuid,
          ${caseId}::uuid,
          ${actorUserId}::uuid,
          'STATUS_CHANGED',
          ${cleanNote},
          ${JSON.stringify({ from: current.status, to: status })}::jsonb
        )
      `);
      return updated;
    });
  }

  async updateLegalHold(
    societyId: string | undefined,
    actorUserId: string,
    caseId: string,
    legalHold: boolean,
    retentionReason?: string,
  ) {
    const current = await this.findCase(societyId, caseId);
    if (!current) throw new NotFoundException('Privacy request case not found');
    if (TERMINAL_STATUSES.includes(current.status)) {
      throw new BadRequestException('Closed privacy request cases cannot change legal-hold state');
    }
    const reason = retentionReason?.trim() || null;
    if (legalHold && !reason) throw new BadRequestException('Retention reason is required when legal hold is enabled');

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<PrivacyCaseRow[]>(Prisma.sql`
        UPDATE "PrivacyRequestCase"
        SET "legalHold" = ${legalHold},
            "retentionReason" = ${legalHold ? reason : null},
            "retentionDecision" = NULL,
            "retentionDecisionReason" = NULL,
            "retentionReviewedAt" = NULL,
            "retentionReviewedByUserId" = NULL,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${caseId}::uuid
          AND "societyId" IS NOT DISTINCT FROM ${societyId ?? null}::uuid
          AND "status" = ${current.status}
          AND "legalHold" = ${current.legalHold}
          AND "retentionDecision" IS NOT DISTINCT FROM ${current.retentionDecision}
        RETURNING *
      `);
      const updated = rows[0];
      if (!updated) throw new BadRequestException('Privacy request case changed; refresh and retry');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PrivacyRequestEvent" (
          "societyId", "caseId", "actorUserId", "eventType", "summary", "metadataJson"
        ) VALUES (
          ${societyId ?? null}::uuid,
          ${caseId}::uuid,
          ${actorUserId}::uuid,
          'LEGAL_HOLD_CHANGED',
          ${legalHold ? 'Legal hold enabled' : 'Legal hold released'},
          ${JSON.stringify({ legalHold, retentionReason: legalHold ? reason : null, retentionReviewInvalidated: current.retentionDecision !== null })}::jsonb
        )
      `);
      return updated;
    });
  }

  async updateRetentionReview(
    societyId: string | undefined,
    actorUserId: string,
    caseId: string,
    decision: 'ALLOW' | 'BLOCK',
    reasonRaw: string,
  ) {
    const current = await this.findCase(societyId, caseId);
    if (!current) throw new NotFoundException('Privacy request case not found');
    if (current.requestType !== 'ERASURE') {
      throw new BadRequestException('Retention review is only valid for erasure cases');
    }
    if (TERMINAL_STATUSES.includes(current.status)) {
      throw new BadRequestException('Closed privacy request cases cannot change retention review');
    }
    const reason = reasonRaw.trim();
    if (!reason) throw new BadRequestException('Retention review reason is required');
    if (decision === 'ALLOW' && current.legalHold) {
      throw new BadRequestException('Retention review cannot allow erasure while legal hold is active');
    }

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<PrivacyCaseRow[]>(Prisma.sql`
        UPDATE "PrivacyRequestCase"
        SET "retentionDecision" = ${decision},
            "retentionDecisionReason" = ${reason},
            "retentionReviewedAt" = CURRENT_TIMESTAMP,
            "retentionReviewedByUserId" = ${actorUserId}::uuid,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${caseId}::uuid
          AND "societyId" IS NOT DISTINCT FROM ${societyId ?? null}::uuid
          AND "status" = ${current.status}
          AND "legalHold" = ${current.legalHold}
          AND "retentionDecision" IS NOT DISTINCT FROM ${current.retentionDecision}
        RETURNING *
      `);
      const updated = rows[0];
      if (!updated) throw new BadRequestException('Privacy request case changed; refresh and retry');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PrivacyRequestEvent" (
          "societyId", "caseId", "actorUserId", "eventType", "summary", "metadataJson"
        ) VALUES (
          ${societyId ?? null}::uuid,
          ${caseId}::uuid,
          ${actorUserId}::uuid,
          'RETENTION_REVIEWED',
          ${decision === 'ALLOW' ? 'Retention review allows erasure completion' : 'Retention review blocks erasure completion'},
          ${JSON.stringify({ decision, reason })}::jsonb
        )
      `);
      return updated;
    });
  }

  async history(societyId: string | undefined, caseId: string) {
    const current = await this.findCase(societyId, caseId);
    if (!current) throw new NotFoundException('Privacy request case not found');
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT pe.*, actor."name" AS "actorName"
      FROM "PrivacyRequestEvent" pe
      JOIN "User" actor ON actor."id" = pe."actorUserId"
      WHERE pe."societyId" IS NOT DISTINCT FROM ${societyId ?? null}::uuid
        AND pe."caseId" = ${caseId}::uuid
      ORDER BY pe."createdAt" ASC
    `);
  }

  private async findCase(societyId: string | undefined, caseId: string) {
    const rows = await this.prisma.$queryRaw<PrivacyCaseRow[]>(Prisma.sql`
      SELECT *
      FROM "PrivacyRequestCase"
      WHERE "id" = ${caseId}::uuid
        AND "societyId" IS NOT DISTINCT FROM ${societyId ?? null}::uuid
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private isUniqueViolation(error: unknown) {
    if (typeof error !== 'object' || error === null) return false;
    const candidate = error as { code?: string; meta?: { code?: string } };
    return candidate.code === '23505' || candidate.code === 'P2002' || candidate.meta?.code === '23505';
  }

  private async assertSocietySubjectRelationship(societyId: string, userId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ userId: string }>>(Prisma.sql`
      SELECT relationship."userId"
      FROM (
        SELECT sm."userId"
        FROM "SocietyMembership" sm
        WHERE sm."societyId" = ${societyId}::uuid AND sm."userId" = ${userId}::uuid
        UNION ALL
        SELECT uo."userId"
        FROM "UnitOwnership" uo
        WHERE uo."societyId" = ${societyId}::uuid AND uo."userId" = ${userId}::uuid
        UNION ALL
        SELECT occ."userId"
        FROM "UnitOccupancy" occ
        WHERE occ."societyId" = ${societyId}::uuid AND occ."userId" = ${userId}::uuid
      ) relationship
      LIMIT 1
    `);
    if (!rows[0]) {
      throw new BadRequestException('Privacy request subject has no current or historical relationship with this society');
    }
  }

  private async assertActiveSocietyMember(societyId: string, userId: string, label: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT sm."id"
      FROM "SocietyMembership" sm
      WHERE sm."societyId" = ${societyId}::uuid
        AND sm."userId" = ${userId}::uuid
        AND sm."active" = true
      LIMIT 1
    `);
    if (!rows[0]) throw new BadRequestException(`${label} must be an active member of the current society`);
  }
}
