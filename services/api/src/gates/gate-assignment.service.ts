import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type GateAssignmentRow = {
  id: string;
  societyId: string;
  gateId: string;
  userId: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  active: boolean;
};

@Injectable()
export class GateAssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAssigned(societyId: string, gateId: string, userId: string, now = new Date()) {
    const rows = await this.prisma.$queryRaw<GateAssignmentRow[]>(Prisma.sql`
      SELECT a.*
      FROM "GateGuardAssignment" a
      JOIN "Gate" g ON g."id" = a."gateId" AND g."societyId" = a."societyId"
      WHERE a."societyId" = ${societyId}::uuid
        AND a."gateId" = ${gateId}::uuid
        AND a."userId" = ${userId}::uuid
        AND a."active" = true
        AND g."active" = true
        AND a."effectiveFrom" <= ${now}
        AND (a."effectiveTo" IS NULL OR a."effectiveTo" > ${now})
      LIMIT 1
    `);
    if (!rows[0]) throw new ForbiddenException('Guard is not assigned to this gate');
    return rows[0];
  }

  async list(societyId: string, gateId: string) {
    await this.assertGate(societyId, gateId);
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT a."id", a."societyId", a."gateId", a."userId", a."effectiveFrom", a."effectiveTo", a."active",
             u."name", u."phone"
      FROM "GateGuardAssignment" a
      JOIN "User" u ON u."id" = a."userId"
      WHERE a."societyId" = ${societyId}::uuid AND a."gateId" = ${gateId}::uuid
      ORDER BY a."active" DESC, a."effectiveFrom" DESC
    `);
  }

  async assign(societyId: string, gateId: string, userId: string, effectiveFrom?: Date, effectiveTo?: Date) {
    await this.assertGate(societyId, gateId);
    if (effectiveFrom && effectiveTo && effectiveTo <= effectiveFrom) {
      throw new BadRequestException('Gate assignment end must be after start');
    }
    const membership = await this.prisma.societyMembership.findFirst({
      where: {
        societyId,
        userId,
        active: true,
        role: { in: [MembershipRole.SECURITY_GUARD, MembershipRole.SECURITY_SUPERVISOR] },
      },
      select: { id: true },
    });
    if (!membership) throw new BadRequestException('User is not an active security guard or supervisor in this society');

    const startsAt = effectiveFrom ?? new Date();
    const rows = await this.prisma.$queryRaw<GateAssignmentRow[]>(Prisma.sql`
      INSERT INTO "GateGuardAssignment" ("societyId", "gateId", "userId", "effectiveFrom", "effectiveTo")
      VALUES (${societyId}::uuid, ${gateId}::uuid, ${userId}::uuid, ${startsAt}, ${effectiveTo ?? null})
      ON CONFLICT ("societyId", "gateId", "userId") WHERE "active" = true
      DO UPDATE SET "effectiveFrom" = EXCLUDED."effectiveFrom", "effectiveTo" = EXCLUDED."effectiveTo", "updatedAt" = CURRENT_TIMESTAMP
      RETURNING *
    `);
    return rows[0];
  }

  async deactivate(societyId: string, gateId: string, assignmentId: string) {
    await this.assertGate(societyId, gateId);
    const rows = await this.prisma.$queryRaw<GateAssignmentRow[]>(Prisma.sql`
      UPDATE "GateGuardAssignment"
      SET "active" = false, "effectiveTo" = COALESCE("effectiveTo", CURRENT_TIMESTAMP), "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${assignmentId}::uuid AND "societyId" = ${societyId}::uuid AND "gateId" = ${gateId}::uuid AND "active" = true
      RETURNING *
    `);
    if (!rows[0]) throw new NotFoundException('Active gate assignment not found');
    return rows[0];
  }

  private async assertGate(societyId: string, gateId: string) {
    const gate = await this.prisma.gate.findFirst({ where: { id: gateId, societyId }, select: { id: true } });
    if (!gate) throw new NotFoundException('Gate not found');
  }
}
