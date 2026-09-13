import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type IncidentStatus = 'OPEN' | 'CONTAINING' | 'INVESTIGATING' | 'REMEDIATING' | 'CLOSED';
type IncidentCategory = 'LOSS' | 'UNAUTHORIZED_ACCESS' | 'DISCLOSURE' | 'INTEGRITY' | 'AVAILABILITY' | 'OTHER';
type IncidentSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

type IncidentRow = {
  id: string;
  societyId: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  status: IncidentStatus;
  summary: string;
  affectedDataCategoryCodes: unknown;
  affectedSubjectEstimate: number | null;
  minorDataSuspected: boolean;
  detectedAt: Date;
  assignedToUserId: string | null;
  createdByUserId: string;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class PrivacyIncidentService {
  constructor(private readonly prisma: PrismaService) {}

  getGrievanceContact(societyId: string) {
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT * FROM "PrivacyGrievanceContact"
      WHERE "societyId" = ${societyId}::uuid
      LIMIT 1
    `);
  }

  async upsertGrievanceContact(
    societyId: string,
    actorUserId: string,
    input: { displayName: string; email?: string; phone?: string; instructions?: string; active: boolean },
  ) {
    const displayName = input.displayName.trim();
    const email = input.email?.trim() || null;
    const phone = input.phone?.trim() || null;
    const instructions = input.instructions?.trim() || null;
    if (!displayName) throw new BadRequestException('Privacy grievance contact name is required');
    if (!email && !phone) throw new BadRequestException('Privacy grievance contact requires an email or phone');

    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO "PrivacyGrievanceContact" (
        "societyId", "displayName", "email", "phone", "instructions", "active", "updatedByUserId"
      ) VALUES (
        ${societyId}::uuid, ${displayName}, ${email}, ${phone}, ${instructions}, ${input.active}, ${actorUserId}::uuid
      )
      ON CONFLICT ("societyId") DO UPDATE SET
        "displayName" = EXCLUDED."displayName",
        "email" = EXCLUDED."email",
        "phone" = EXCLUDED."phone",
        "instructions" = EXCLUDED."instructions",
        "active" = EXCLUDED."active",
        "updatedByUserId" = EXCLUDED."updatedByUserId",
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING *
    `);
    return rows[0];
  }

  listIncidents(societyId: string) {
    return this.prisma.$queryRaw<Array<IncidentRow & { assignedToName: string | null; createdByName: string }>>(Prisma.sql`
      SELECT psi.*, assignee."name" AS "assignedToName", creator."name" AS "createdByName"
      FROM "PrivacySecurityIncident" psi
      JOIN "User" creator ON creator."id" = psi."createdByUserId"
      LEFT JOIN "User" assignee ON assignee."id" = psi."assignedToUserId"
      WHERE psi."societyId" = ${societyId}::uuid
      ORDER BY
        CASE psi."status" WHEN 'OPEN' THEN 0 WHEN 'CONTAINING' THEN 1 WHEN 'INVESTIGATING' THEN 2 WHEN 'REMEDIATING' THEN 3 ELSE 4 END,
        CASE psi."severity" WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
        psi."detectedAt" DESC
      LIMIT 250
    `);
  }

  async createIncident(
    societyId: string,
    actorUserId: string,
    input: {
      category: IncidentCategory;
      severity: IncidentSeverity;
      summary: string;
      affectedDataCategoryCodes: string[];
      affectedSubjectEstimate?: number;
      minorDataSuspected: boolean;
      detectedAt: string;
      assignedToUserId?: string;
    },
  ) {
    const summary = input.summary.trim();
    if (!summary) throw new BadRequestException('Privacy incident summary is required');
    await this.assertActiveCategoryCodes(societyId, input.affectedDataCategoryCodes);
    if (input.assignedToUserId) await this.assertActiveSocietyMember(societyId, input.assignedToUserId);
    const detectedAt = new Date(input.detectedAt);
    if (Number.isNaN(detectedAt.getTime())) throw new BadRequestException('Privacy incident detectedAt is invalid');

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<IncidentRow[]>(Prisma.sql`
        INSERT INTO "PrivacySecurityIncident" (
          "societyId", "category", "severity", "summary", "affectedDataCategoryCodes",
          "affectedSubjectEstimate", "minorDataSuspected", "detectedAt", "assignedToUserId", "createdByUserId"
        ) VALUES (
          ${societyId}::uuid, ${input.category}, ${input.severity}, ${summary},
          ${JSON.stringify(input.affectedDataCategoryCodes)}::jsonb,
          ${input.affectedSubjectEstimate ?? null}, ${input.minorDataSuspected}, ${detectedAt},
          ${input.assignedToUserId ?? null}::uuid, ${actorUserId}::uuid
        ) RETURNING *
      `);
      const incident = rows[0];
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PrivacySecurityIncidentEvent" (
          "societyId", "incidentId", "actorUserId", "eventType", "summary", "metadataJson"
        ) VALUES (
          ${societyId}::uuid, ${incident.id}::uuid, ${actorUserId}::uuid,
          'INCIDENT_CREATED', 'Privacy/security incident recorded',
          ${JSON.stringify({ category: input.category, severity: input.severity, minorDataSuspected: input.minorDataSuspected })}::jsonb
        )
      `);
      return incident;
    });
  }

  async updateStatus(societyId: string, actorUserId: string, incidentId: string, status: IncidentStatus, note?: string) {
    const current = await this.findIncident(societyId, incidentId);
    if (!current) throw new NotFoundException('Privacy/security incident not found');
    if (current.status === 'CLOSED') {
      if (status === 'CLOSED') return current;
      throw new BadRequestException('Closed privacy/security incidents cannot be reopened');
    }
    const cleanNote = note?.trim() || 'Privacy/security incident status updated';
    const closedAt = status === 'CLOSED' ? new Date() : null;

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<IncidentRow[]>(Prisma.sql`
        UPDATE "PrivacySecurityIncident"
        SET "status" = ${status}, "closedAt" = ${closedAt}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${incidentId}::uuid AND "societyId" = ${societyId}::uuid AND "status" = ${current.status}
        RETURNING *
      `);
      const updated = rows[0];
      if (!updated) throw new BadRequestException('Privacy/security incident changed; refresh and retry');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PrivacySecurityIncidentEvent" (
          "societyId", "incidentId", "actorUserId", "eventType", "summary", "metadataJson"
        ) VALUES (
          ${societyId}::uuid, ${incidentId}::uuid, ${actorUserId}::uuid,
          'STATUS_CHANGED', ${cleanNote}, ${JSON.stringify({ from: current.status, to: status })}::jsonb
        )
      `);
      return updated;
    });
  }

  async history(societyId: string, incidentId: string) {
    const incident = await this.findIncident(societyId, incidentId);
    if (!incident) throw new NotFoundException('Privacy/security incident not found');
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT e.*, actor."name" AS "actorName"
      FROM "PrivacySecurityIncidentEvent" e
      JOIN "User" actor ON actor."id" = e."actorUserId"
      WHERE e."societyId" = ${societyId}::uuid AND e."incidentId" = ${incidentId}::uuid
      ORDER BY e."createdAt" ASC
    `);
  }

  private async findIncident(societyId: string, incidentId: string) {
    const rows = await this.prisma.$queryRaw<IncidentRow[]>(Prisma.sql`
      SELECT * FROM "PrivacySecurityIncident"
      WHERE "id" = ${incidentId}::uuid AND "societyId" = ${societyId}::uuid
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private async assertActiveCategoryCodes(societyId: string, codes: string[]) {
    const normalized = [...new Set(codes.map((code) => code.trim()).filter(Boolean))];
    if (normalized.length !== codes.length) throw new BadRequestException('Affected data category codes must be unique and non-empty');
    if (normalized.length === 0) return;
    const rows = await this.prisma.$queryRaw<Array<{ code: string }>>(Prisma.sql`
      SELECT "code" FROM "PrivacyDataCategory"
      WHERE "societyId" = ${societyId}::uuid AND "active" = true
        AND "code" IN (${Prisma.join(normalized)})
    `);
    const found = new Set(rows.map((row) => row.code));
    const missing = normalized.filter((code) => !found.has(code));
    if (missing.length > 0) throw new BadRequestException(`Unknown or inactive privacy data categories: ${missing.join(', ')}`);
  }

  private async assertActiveSocietyMember(societyId: string, userId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "SocietyMembership"
      WHERE "societyId" = ${societyId}::uuid AND "userId" = ${userId}::uuid AND "active" = true
      LIMIT 1
    `);
    if (!rows[0]) throw new BadRequestException('Privacy incident assignee must be an active member of the current society');
  }
}
