import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type SosStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CANCELLED';

type SosIncidentRow = {
  id: string;
  societyId: string;
  unitId: string;
  residentUserId: string;
  status: SosStatus;
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

@Injectable()
export class SosService {
  constructor(private readonly prisma: PrismaService) {}

  async trigger(
    societyId: string,
    residentUserId: string,
    input: { unitId: string; message?: string; latitude?: number; longitude?: number },
  ) {
    await this.assertResidentUnit(societyId, residentUserId, input.unitId);
    if (input.latitude !== undefined && (input.latitude < -90 || input.latitude > 90)) {
      throw new BadRequestException('Latitude must be between -90 and 90');
    }
    if (input.longitude !== undefined && (input.longitude < -180 || input.longitude > 180)) {
      throw new BadRequestException('Longitude must be between -180 and 180');
    }
    const message = input.message?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<SosIncidentRow[]>(Prisma.sql`
        INSERT INTO "SosIncident" ("societyId", "unitId", "residentUserId", "message", "latitude", "longitude")
        VALUES (${societyId}::uuid, ${input.unitId}::uuid, ${residentUserId}::uuid, ${message}, ${input.latitude ?? null}, ${input.longitude ?? null})
        RETURNING *
      `);
      const incident = rows[0];
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "SosIncidentEvent" ("societyId", "incidentId", "actorUserId", "action", "toStatus")
        VALUES (${societyId}::uuid, ${incident.id}::uuid, ${residentUserId}::uuid, 'TRIGGERED', 'ACTIVE')
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
      SELECT si.*, u."number" AS "unitNumber", b."name" AS "buildingName", r."name" AS "residentName", r."phone" AS "residentPhone"
      FROM "SosIncident" si
      JOIN "Unit" u ON u."id" = si."unitId"
      JOIN "Building" b ON b."id" = u."buildingId"
      JOIN "User" r ON r."id" = si."residentUserId"
      WHERE si."societyId" = ${societyId}::uuid
      ORDER BY
        CASE si."status" WHEN 'ACTIVE' THEN 0 WHEN 'ACKNOWLEDGED' THEN 1 ELSE 2 END,
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
      SELECT ur."id"
      FROM "UnitResident" ur
      WHERE ur."societyId" = ${societyId}::uuid
        AND ur."userId" = ${userId}::uuid
        AND ur."unitId" = ${unitId}::uuid
        AND ur."active" = true
      LIMIT 1
    `);
    if (!rows[0]) throw new BadRequestException('Unit is not assigned to the authenticated resident');
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
