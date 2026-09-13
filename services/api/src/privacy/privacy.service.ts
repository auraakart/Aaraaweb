import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PrivacyRequestType = 'ACCESS' | 'CORRECTION' | 'ERASURE' | 'OTHER';
type PrivacyCaseStatus = 'OPEN' | 'IN_REVIEW' | 'WAITING' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';

type PrivacyCaseRow = {
  id: string;
  societyId: string;
  subjectUserId: string;
  requestType: PrivacyRequestType;
  status: PrivacyCaseStatus;
  requestSummary: string;
  assignedToUserId: string | null;
  legalHold: boolean;
  retentionReason: string | null;
  dueAt: Date | null;
  closedAt: Date | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

const TERMINAL_STATUSES: readonly PrivacyCaseStatus[] = ['COMPLETED', 'REJECTED', 'CANCELLED'];

@Injectable()
export class PrivacyService {
  constructor(private readonly prisma: PrismaService) {}

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
    await this.assertActiveSocietyMember(societyId, input.subjectUserId, 'Privacy request subject');
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

  async updateStatus(
    societyId: string,
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
    if (status === 'COMPLETED' && current.requestType === 'ERASURE' && current.legalHold) {
      throw new BadRequestException('Erasure case cannot be completed while legal hold is active');
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
          AND "societyId" = ${societyId}::uuid
          AND "status" = ${current.status}
        RETURNING *
      `);
      const updated = rows[0];
      if (!updated) throw new BadRequestException('Privacy request case changed; refresh and retry');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PrivacyRequestEvent" (
          "societyId", "caseId", "actorUserId", "eventType", "summary", "metadataJson"
        ) VALUES (
          ${societyId}::uuid,
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
    societyId: string,
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
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${caseId}::uuid
          AND "societyId" = ${societyId}::uuid
        RETURNING *
      `);
      const updated = rows[0];
      if (!updated) throw new BadRequestException('Privacy request case changed; refresh and retry');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PrivacyRequestEvent" (
          "societyId", "caseId", "actorUserId", "eventType", "summary", "metadataJson"
        ) VALUES (
          ${societyId}::uuid,
          ${caseId}::uuid,
          ${actorUserId}::uuid,
          'LEGAL_HOLD_CHANGED',
          ${legalHold ? 'Legal hold enabled' : 'Legal hold released'},
          ${JSON.stringify({ legalHold, retentionReason: legalHold ? reason : null })}::jsonb
        )
      `);
      return updated;
    });
  }

  async history(societyId: string, caseId: string) {
    const current = await this.findCase(societyId, caseId);
    if (!current) throw new NotFoundException('Privacy request case not found');
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT pe.*, actor."name" AS "actorName"
      FROM "PrivacyRequestEvent" pe
      JOIN "User" actor ON actor."id" = pe."actorUserId"
      WHERE pe."societyId" = ${societyId}::uuid
        AND pe."caseId" = ${caseId}::uuid
      ORDER BY pe."createdAt" ASC
    `);
  }

  private async findCase(societyId: string, caseId: string) {
    const rows = await this.prisma.$queryRaw<PrivacyCaseRow[]>(Prisma.sql`
      SELECT *
      FROM "PrivacyRequestCase"
      WHERE "id" = ${caseId}::uuid
        AND "societyId" = ${societyId}::uuid
      LIMIT 1
    `);
    return rows[0] ?? null;
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
