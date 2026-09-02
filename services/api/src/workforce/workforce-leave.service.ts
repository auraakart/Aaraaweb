import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type WorkforceLeaveRow = {
  id: string;
  societyId: string;
  assignmentId: string;
  createdById: string;
  startsOn: Date;
  endsOn: Date;
  reason: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type AssignmentOwnershipRow = {
  assignmentId: string;
};

type ActiveLeaveRow = {
  assignmentId: string;
};

@Injectable()
export class WorkforceLeaveService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(societyId: string, userId: string) {
    return this.prisma.$queryRaw<WorkforceLeaveRow[]>(Prisma.sql`
      SELECT wl.*
      FROM "WorkforceLeave" wl
      JOIN "WorkforceAssignment" wa ON wa."id" = wl."assignmentId"
      JOIN "Household" h ON h."id" = wa."householdId"
      WHERE wl."societyId" = ${societyId}::uuid
        AND wa."societyId" = ${societyId}::uuid
        AND EXISTS (
          SELECT 1 FROM "UnitOccupancy" uo
          WHERE uo."unitId" = h."unitId"
            AND uo."societyId" = ${societyId}::uuid
            AND uo."userId" = ${userId}::uuid
            AND uo."active" = true
            AND uo."effectiveFrom" <= CURRENT_TIMESTAMP
            AND (uo."effectiveTo" IS NULL OR uo."effectiveTo" > CURRENT_TIMESTAMP)
        )
      ORDER BY wl."startsOn" DESC, wl."createdAt" DESC
    `);
  }

  async listSocietyActive(societyId: string, on = this.indiaDate(new Date())) {
    this.assertDateOnly(on, 'on');
    return this.prisma.$queryRaw<WorkforceLeaveRow[]>(Prisma.sql`
      SELECT wl.*
      FROM "WorkforceLeave" wl
      WHERE wl."societyId" = ${societyId}::uuid
        AND wl."active" = true
        AND wl."startsOn" <= ${on}::date
        AND wl."endsOn" >= ${on}::date
      ORDER BY wl."startsOn" ASC, wl."createdAt" ASC
    `);
  }

  async createMine(
    societyId: string,
    userId: string,
    input: { assignmentId: string; startsOn: string; endsOn: string; reason?: string },
  ) {
    this.assertDateOnly(input.startsOn, 'startsOn');
    this.assertDateOnly(input.endsOn, 'endsOn');
    if (input.endsOn < input.startsOn) throw new BadRequestException('Leave end date must be on or after start date');
    if (this.daysBetween(input.startsOn, input.endsOn) > 90) throw new BadRequestException('Workforce leave cannot exceed 90 days');

    await this.assertOwnedAssignment(societyId, userId, input.assignmentId);

    const overlap = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "WorkforceLeave"
      WHERE "societyId" = ${societyId}::uuid
        AND "assignmentId" = ${input.assignmentId}::uuid
        AND "active" = true
        AND "startsOn" <= ${input.endsOn}::date
        AND "endsOn" >= ${input.startsOn}::date
      LIMIT 1
    `);
    if (overlap.length) throw new BadRequestException('An active workforce leave already overlaps this date range');

    const reason = input.reason?.trim() || null;
    const rows = await this.prisma.$queryRaw<WorkforceLeaveRow[]>(Prisma.sql`
      INSERT INTO "WorkforceLeave" (
        "societyId", "assignmentId", "createdById", "startsOn", "endsOn", "reason"
      ) VALUES (
        ${societyId}::uuid,
        ${input.assignmentId}::uuid,
        ${userId}::uuid,
        ${input.startsOn}::date,
        ${input.endsOn}::date,
        ${reason}
      )
      RETURNING *
    `);
    return rows[0];
  }

  async cancelMine(societyId: string, userId: string, leaveId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; assignmentId: string }>>(Prisma.sql`
      SELECT wl."id", wl."assignmentId"
      FROM "WorkforceLeave" wl
      JOIN "WorkforceAssignment" wa ON wa."id" = wl."assignmentId"
      JOIN "Household" h ON h."id" = wa."householdId"
      WHERE wl."id" = ${leaveId}::uuid
        AND wl."societyId" = ${societyId}::uuid
        AND wa."societyId" = ${societyId}::uuid
        AND EXISTS (
          SELECT 1 FROM "UnitOccupancy" uo
          WHERE uo."unitId" = h."unitId"
            AND uo."societyId" = ${societyId}::uuid
            AND uo."userId" = ${userId}::uuid
            AND uo."active" = true
            AND uo."effectiveFrom" <= CURRENT_TIMESTAMP
            AND (uo."effectiveTo" IS NULL OR uo."effectiveTo" > CURRENT_TIMESTAMP)
        )
        AND wl."active" = true
      LIMIT 1
    `);
    if (!rows.length) throw new NotFoundException('Active workforce leave not found');

    const updated = await this.prisma.$queryRaw<WorkforceLeaveRow[]>(Prisma.sql`
      UPDATE "WorkforceLeave"
      SET "active" = false, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${leaveId}::uuid
        AND "societyId" = ${societyId}::uuid
      RETURNING *
    `);
    return updated[0];
  }

  async assertNoActiveLeave(societyId: string, assignmentId: string, now = new Date()) {
    const on = this.indiaDate(now);
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "WorkforceLeave"
      WHERE "societyId" = ${societyId}::uuid
        AND "assignmentId" = ${assignmentId}::uuid
        AND "active" = true
        AND "startsOn" <= ${on}::date
        AND "endsOn" >= ${on}::date
      LIMIT 1
    `);
    if (rows.length) throw new BadRequestException('Worker is on approved leave today');
  }

  async activeAssignmentIds(societyId: string, assignmentIds: string[], now = new Date()) {
    if (!assignmentIds.length) return new Set<string>();
    const on = this.indiaDate(now);
    const ids = Prisma.join(assignmentIds.map((id) => Prisma.sql`${id}::uuid`));
    const rows = await this.prisma.$queryRaw<ActiveLeaveRow[]>(Prisma.sql`
      SELECT DISTINCT "assignmentId"
      FROM "WorkforceLeave"
      WHERE "societyId" = ${societyId}::uuid
        AND "active" = true
        AND "startsOn" <= ${on}::date
        AND "endsOn" >= ${on}::date
        AND "assignmentId" IN (${ids})
    `);
    return new Set(rows.map((row) => row.assignmentId));
  }

  private async assertOwnedAssignment(societyId: string, userId: string, assignmentId: string) {
    const rows = await this.prisma.$queryRaw<AssignmentOwnershipRow[]>(Prisma.sql`
      SELECT wa."id" AS "assignmentId"
      FROM "WorkforceAssignment" wa
      JOIN "Household" h ON h."id" = wa."householdId"
      WHERE wa."id" = ${assignmentId}::uuid
        AND wa."societyId" = ${societyId}::uuid
        AND wa."active" = true
        AND EXISTS (
          SELECT 1 FROM "UnitOccupancy" uo
          WHERE uo."unitId" = h."unitId"
            AND uo."societyId" = ${societyId}::uuid
            AND uo."userId" = ${userId}::uuid
            AND uo."active" = true
            AND uo."effectiveFrom" <= CURRENT_TIMESTAMP
            AND (uo."effectiveTo" IS NULL OR uo."effectiveTo" > CURRENT_TIMESTAMP)
        )
      LIMIT 1
    `);
    if (!rows.length) throw new NotFoundException('Active workforce assignment not found');
  }

  private assertDateOnly(value: string, field: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
      throw new BadRequestException(`${field} must be a valid YYYY-MM-DD date`);
    }
  }

  private daysBetween(start: string, end: string) {
    return Math.floor((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000);
  }

  private indiaDate(value: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }
}
