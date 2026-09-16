import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type SosStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CANCELLED';
type SosCategory = 'MEDICAL' | 'FIRE' | 'SECURITY' | 'LIFT' | 'OTHER';
type SosSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';

type SosIncidentRow = {
  id: string;
  societyId: string;
  unitId: string;
  residentUserId: string;
  status: SosStatus;
  category: SosCategory;
  severity: SosSeverity;
  message: string | null;
  latitude: number | null;
  longitude: number | null;
  acknowledgedById: string | null;
  acknowledgedAt: Date | null;
  resolvedById: string | null;
  resolvedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const SOS_RESPONDER_ROLES = [
  'SOCIETY_ADMIN',
  'COMMITTEE_MEMBER',
  'FACILITY_MANAGER',
  'SECURITY_SUPERVISOR',
  'SECURITY_GUARD',
] as const;

@Injectable()
export class SosService {
  constructor(private readonly prisma: PrismaService) {}

  async trigger(
    societyId: string,
    residentUserId: string,
    input: {
      unitId: string;
      category?: SosCategory;
      severity?: SosSeverity;
      message?: string;
      latitude?: number;
      longitude?: number;
    },
  ) {
    await this.assertResidentUnit(societyId, residentUserId, input.unitId);
    if (input.latitude !== undefined && (input.latitude < -90 || input.latitude > 90)) {
      throw new BadRequestException('Latitude must be between -90 and 90');
    }
    if (input.longitude !== undefined && (input.longitude < -180 || input.longitude > 180)) {
      throw new BadRequestException('Longitude must be between -180 and 180');
    }
    const category = input.category ?? 'OTHER';
    const severity = input.severity ?? 'HIGH';
    const message = input.message?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<SosIncidentRow[]>(Prisma.sql`
        INSERT INTO "SosIncident" (
          "societyId", "unitId", "residentUserId", "category", "severity", "message", "latitude", "longitude"
        )
        VALUES (
          ${societyId}::uuid,
          ${input.unitId}::uuid,
          ${residentUserId}::uuid,
          ${category},
          ${severity},
          ${message},
          ${input.latitude ?? null},
          ${input.longitude ?? null}
        )
        RETURNING *
      `);
      const incident = rows[0];
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "SosIncidentEvent" ("societyId", "incidentId", "actorUserId", "action", "toStatus", "note")
        VALUES (
          ${societyId}::uuid,
          ${incident.id}::uuid,
          ${residentUserId}::uuid,
          'TRIGGERED',
          'ACTIVE',
          ${`category=${category};severity=${severity}`}
        )
      `);
      return incident;
    });
  }

  listMine(societyId: string, residentUserId: string) {
    return this.prisma.$queryRaw<SosIncidentRow[]>(Prisma.sql`
      SELECT si.*
      FROM "SosIncident" si
      WHERE si."societyId" = ${societyId}::uuid AND si."residentUserId" = ${residentUserId}::uuid
      ORDER BY si."createdAt" DESC
      LIMIT 100
    `);
  }

  listManage(societyId: string) {
    return this.prisma.$queryRaw<SosIncidentRow[]>(Prisma.sql`
      SELECT
        si.*,
        u."number" AS "unitNumber",
        b."name" AS "buildingName",
        r."name" AS "residentName",
        r."phone" AS "residentPhone",
        escalation."escalatedAt",
        assignment."assignedToUserId",
        assignment."assignedAt",
        assigned_user."name" AS "assignedToName",
        evidence."evidenceCount"
      FROM "SosIncident" si
      JOIN "Unit" u ON u."id" = si."unitId"
      JOIN "Building" b ON b."id" = u."buildingId"
      JOIN "User" r ON r."id" = si."residentUserId"
      LEFT JOIN LATERAL (
        SELECT MAX(se."occurredAt") AS "escalatedAt"
        FROM "SosIncidentEvent" se
        WHERE se."societyId" = si."societyId"
          AND se."incidentId" = si."id"
          AND se."action" = 'ESCALATED'
      ) escalation ON true
      LEFT JOIN LATERAL (
        SELECT
          se."occurredAt" AS "assignedAt",
          (se."note"::jsonb ->> 'assigneeUserId')::uuid AS "assignedToUserId"
        FROM "SosIncidentEvent" se
        WHERE se."societyId" = si."societyId"
          AND se."incidentId" = si."id"
          AND se."action" = 'ASSIGNED'
        ORDER BY se."occurredAt" DESC
        LIMIT 1
      ) assignment ON true
      LEFT JOIN "User" assigned_user ON assigned_user."id" = assignment."assignedToUserId"
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS "evidenceCount"
        FROM "SosIncidentEvent" se
        WHERE se."societyId" = si."societyId"
          AND se."incidentId" = si."id"
          AND se."action" = 'EVIDENCE_ADDED'
      ) evidence ON true
      WHERE si."societyId" = ${societyId}::uuid
      ORDER BY
        CASE WHEN escalation."escalatedAt" IS NOT NULL AND si."status" IN ('ACTIVE', 'ACKNOWLEDGED') THEN 0 ELSE 1 END,
        CASE si."status" WHEN 'ACTIVE' THEN 0 WHEN 'ACKNOWLEDGED' THEN 1 ELSE 2 END,
        CASE si."severity" WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END,
        si."createdAt" DESC
      LIMIT 250
    `);
  }

  async cancel(societyId: string, residentUserId: string, incidentId: string, note?: string) {
    const current = await this.findIncident(societyId, incidentId);
    if (!current || current.residentUserId !== residentUserId) throw new NotFoundException('SOS incident not found');
    if (current.status === 'CANCELLED') return current;
    if (current.status === 'RESOLVED') throw new BadRequestException('Resolved SOS incident cannot be cancelled');
    return this.transition(societyId, residentUserId, current, 'CANCELLED', 'CANCELLED', note);
  }

  async acknowledge(societyId: string, actorUserId: string, incidentId: string, note?: string) {
    const current = await this.findIncident(societyId, incidentId);
    if (!current) throw new NotFoundException('SOS incident not found');
    if (current.status === 'ACKNOWLEDGED') return current;
    if (current.status !== 'ACTIVE') throw new BadRequestException('Only active SOS incidents can be acknowledged');
    return this.transition(societyId, actorUserId, current, 'ACKNOWLEDGED', 'ACKNOWLEDGED', note);
  }

  async escalate(societyId: string, actorUserId: string, incidentId: string, note?: string) {
    const current = await this.findIncident(societyId, incidentId);
    if (!current) throw new NotFoundException('SOS incident not found');
    if (current.status !== 'ACTIVE' && current.status !== 'ACKNOWLEDGED') {
      throw new BadRequestException('Only active or acknowledged SOS incidents can be escalated');
    }
    const cleanNote = note?.trim() || null;
    const events = await this.prisma.$queryRaw<Array<{ occurredAt: Date }>>(Prisma.sql`
      INSERT INTO "SosIncidentEvent" (
        "societyId", "incidentId", "actorUserId", "action", "fromStatus", "toStatus", "note"
      )
      VALUES (
        ${societyId}::uuid,
        ${incidentId}::uuid,
        ${actorUserId}::uuid,
        'ESCALATED',
        ${current.status}::"SosStatus",
        ${current.status}::"SosStatus",
        ${cleanNote}
      )
      RETURNING "occurredAt"
    `);
    return { ...current, escalatedAt: events[0]?.occurredAt ?? null };
  }

  async assign(
    societyId: string,
    actorUserId: string,
    incidentId: string,
    assigneeUserId: string,
    note?: string,
  ) {
    const current = await this.findIncident(societyId, incidentId);
    if (!current) throw new NotFoundException('SOS incident not found');
    this.assertOpenForResponse(current);
    await this.assertResponderMembership(societyId, assigneeUserId);
    const eventNote = JSON.stringify({ assigneeUserId, note: note?.trim() || null });
    const events = await this.prisma.$queryRaw<Array<{ occurredAt: Date }>>(Prisma.sql`
      INSERT INTO "SosIncidentEvent" (
        "societyId", "incidentId", "actorUserId", "action", "fromStatus", "toStatus", "note"
      )
      VALUES (
        ${societyId}::uuid,
        ${incidentId}::uuid,
        ${actorUserId}::uuid,
        'ASSIGNED',
        ${current.status}::"SosStatus",
        ${current.status}::"SosStatus",
        ${eventNote}
      )
      RETURNING "occurredAt"
    `);
    return { ...current, assignedToUserId: assigneeUserId, assignedAt: events[0]?.occurredAt ?? null };
  }

  async addEvidence(
    societyId: string,
    actorUserId: string,
    incidentId: string,
    input: { objectKey: string; fileName: string; contentType?: string; note?: string },
  ) {
    const current = await this.findIncident(societyId, incidentId);
    if (!current) throw new NotFoundException('SOS incident not found');
    this.assertOpenForResponse(current);
    const objectKey = input.objectKey.trim();
    if (!objectKey || objectKey.includes('://')) {
      throw new BadRequestException('Evidence must use a private object key, not a public URL');
    }
    const fileName = input.fileName.trim();
    if (!fileName) throw new BadRequestException('Evidence file name is required');
    const eventNote = JSON.stringify({
      objectKey,
      fileName,
      contentType: input.contentType?.trim() || null,
      note: input.note?.trim() || null,
    });
    const events = await this.prisma.$queryRaw<Array<{ id: string; occurredAt: Date }>>(Prisma.sql`
      INSERT INTO "SosIncidentEvent" (
        "societyId", "incidentId", "actorUserId", "action", "fromStatus", "toStatus", "note"
      )
      VALUES (
        ${societyId}::uuid,
        ${incidentId}::uuid,
        ${actorUserId}::uuid,
        'EVIDENCE_ADDED',
        ${current.status}::"SosStatus",
        ${current.status}::"SosStatus",
        ${eventNote}
      )
      RETURNING "id", "occurredAt"
    `);
    return { ...events[0], incidentId, objectKey, fileName, contentType: input.contentType?.trim() || null };
  }

  async evidence(societyId: string, incidentId: string) {
    const current = await this.findIncident(societyId, incidentId);
    if (!current) throw new NotFoundException('SOS incident not found');
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT
        se."id",
        se."incidentId",
        se."actorUserId",
        actor."name" AS "actorName",
        se."occurredAt",
        se."note"::jsonb ->> 'objectKey' AS "objectKey",
        se."note"::jsonb ->> 'fileName' AS "fileName",
        se."note"::jsonb ->> 'contentType' AS "contentType",
        se."note"::jsonb ->> 'note' AS "note"
      FROM "SosIncidentEvent" se
      JOIN "User" actor ON actor."id" = se."actorUserId"
      WHERE se."societyId" = ${societyId}::uuid
        AND se."incidentId" = ${incidentId}::uuid
        AND se."action" = 'EVIDENCE_ADDED'
      ORDER BY se."occurredAt" ASC
    `);
  }

  async escalationTargets(societyId: string, incidentId: string) {
    const current = await this.findIncident(societyId, incidentId);
    if (!current) throw new NotFoundException('SOS incident not found');
    return this.prisma.$queryRaw<
      Array<{ contactId: string; name: string; phone: string; relation: string | null; priority: number }>
    >(Prisma.sql`
      SELECT
        ec."id" AS "contactId",
        ec."name",
        ec."phone",
        ec."relation",
        ec."priority"
      FROM "Household" h
      JOIN "EmergencyContact" ec
        ON ec."householdId" = h."id"
       AND ec."societyId" = h."societyId"
      WHERE h."societyId" = ${societyId}::uuid
        AND h."unitId" = ${current.unitId}::uuid
        AND ec."active" = true
      ORDER BY ec."priority" ASC, ec."createdAt" ASC
      LIMIT 10
    `);
  }

  async resolve(societyId: string, actorUserId: string, incidentId: string, note?: string) {
    const current = await this.findIncident(societyId, incidentId);
    if (!current) throw new NotFoundException('SOS incident not found');
    if (current.status === 'RESOLVED') return current;
    if (current.status !== 'ACTIVE' && current.status !== 'ACKNOWLEDGED') {
      throw new BadRequestException('Only active or acknowledged SOS incidents can be resolved');
    }
    return this.transition(societyId, actorUserId, current, 'RESOLVED', 'RESOLVED', note);
  }

  async history(societyId: string, incidentId: string) {
    const current = await this.findIncident(societyId, incidentId);
    if (!current) throw new NotFoundException('SOS incident not found');
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT se.*, actor."name" AS "actorName"
      FROM "SosIncidentEvent" se
      JOIN "User" actor ON actor."id" = se."actorUserId"
      WHERE se."societyId" = ${societyId}::uuid AND se."incidentId" = ${incidentId}::uuid
      ORDER BY se."occurredAt" ASC
    `);
  }

  private async transition(
    societyId: string,
    actorUserId: string,
    current: SosIncidentRow,
    toStatus: SosStatus,
    action: string,
    note?: string,
  ) {
    const cleanNote = note?.trim() || null;
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<SosIncidentRow[]>(Prisma.sql`
        UPDATE "SosIncident"
        SET
          "status" = ${toStatus}::"SosStatus",
          "acknowledgedById" = CASE WHEN ${toStatus} = 'ACKNOWLEDGED' THEN ${actorUserId}::uuid ELSE "acknowledgedById" END,
          "acknowledgedAt" = CASE WHEN ${toStatus} = 'ACKNOWLEDGED' THEN CURRENT_TIMESTAMP ELSE "acknowledgedAt" END,
          "resolvedById" = CASE WHEN ${toStatus} = 'RESOLVED' THEN ${actorUserId}::uuid ELSE "resolvedById" END,
          "resolvedAt" = CASE WHEN ${toStatus} = 'RESOLVED' THEN CURRENT_TIMESTAMP ELSE "resolvedAt" END,
          "cancelledAt" = CASE WHEN ${toStatus} = 'CANCELLED' THEN CURRENT_TIMESTAMP ELSE "cancelledAt" END,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${current.id}::uuid AND "societyId" = ${societyId}::uuid AND "status" = ${current.status}::"SosStatus"
        RETURNING *
      `);
      const updated = rows[0];
      if (!updated) throw new BadRequestException('SOS incident changed; refresh and retry');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "SosIncidentEvent" ("societyId", "incidentId", "actorUserId", "action", "fromStatus", "toStatus", "note")
        VALUES (${societyId}::uuid, ${current.id}::uuid, ${actorUserId}::uuid, ${action}, ${current.status}::"SosStatus", ${toStatus}::"SosStatus", ${cleanNote})
      `);
      return updated;
    });
  }

  private async assertResidentUnit(societyId: string, userId: string, unitId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT uo."id"
      FROM "UnitOccupancy" uo
      WHERE uo."societyId" = ${societyId}::uuid
        AND uo."userId" = ${userId}::uuid
        AND uo."unitId" = ${unitId}::uuid
        AND uo."active" = true
        AND uo."effectiveFrom" <= CURRENT_TIMESTAMP
        AND (uo."effectiveTo" IS NULL OR uo."effectiveTo" > CURRENT_TIMESTAMP)
      LIMIT 1
    `);
    if (!rows[0]) throw new BadRequestException('Unit is not assigned to the authenticated resident');
  }

  private async assertResponderMembership(societyId: string, userId: string) {
    const roles = Prisma.join(SOS_RESPONDER_ROLES.map((role) => Prisma.sql`${role}::"MembershipRole"`));
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT sm."id"
      FROM "SocietyMembership" sm
      WHERE sm."societyId" = ${societyId}::uuid
        AND sm."userId" = ${userId}::uuid
        AND sm."active" = true
        AND sm."role" IN (${roles})
      LIMIT 1
    `);
    if (!rows[0]) throw new BadRequestException('Assignee must be an active SOS responder in this society');
  }

  private assertOpenForResponse(current: SosIncidentRow) {
    if (current.status !== 'ACTIVE' && current.status !== 'ACKNOWLEDGED') {
      throw new BadRequestException('Only active or acknowledged SOS incidents can be updated');
    }
  }

  private async findIncident(societyId: string, incidentId: string) {
    const rows = await this.prisma.$queryRaw<SosIncidentRow[]>(Prisma.sql`
      SELECT * FROM "SosIncident"
      WHERE "id" = ${incidentId}::uuid AND "societyId" = ${societyId}::uuid
      LIMIT 1
    `);
    return rows[0] ?? null;
  }
}
