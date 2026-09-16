import { Injectable } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppRole } from './auth.types';
import { Membership } from './membership.service';

const AUDITOR_RESPONSIBILITY = 'READ_ONLY_AUDITOR';
const toAppRole = (role: MembershipRole): AppRole => role as AppRole;

type AuditorAssignmentRow = {
  userId: string;
  societyId: string;
};

@Injectable()
export class PrismaMembershipRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveByUser(userId: string): Promise<Membership[]> {
    const [rows, auditorRows] = await Promise.all([
      this.prisma.societyMembership.findMany({ where: { userId, active: true } }),
      this.prisma.$queryRaw<AuditorAssignmentRow[]>`
        SELECT "userId", "societyId"
        FROM "SocietyResponsibilityAssignment"
        WHERE "userId" = CAST(${userId} AS uuid)
          AND "responsibility" = ${AUDITOR_RESPONSIBILITY}
          AND "active" = true
      `,
    ]);
    return [
      ...rows.map((row) => ({ userId: row.userId, societyId: row.societyId, role: toAppRole(row.role), active: row.active })),
      ...auditorRows.map((row) => ({ userId: row.userId, societyId: row.societyId, role: AppRole.AUDITOR, active: true })),
    ];
  }

  async findActiveByUserAndSociety(userId: string, societyId: string): Promise<Membership[]> {
    const [rows, auditorRows] = await Promise.all([
      this.prisma.societyMembership.findMany({ where: { userId, societyId, active: true } }),
      this.prisma.$queryRaw<AuditorAssignmentRow[]>`
        SELECT "userId", "societyId"
        FROM "SocietyResponsibilityAssignment"
        WHERE "userId" = CAST(${userId} AS uuid)
          AND "societyId" = CAST(${societyId} AS uuid)
          AND "responsibility" = ${AUDITOR_RESPONSIBILITY}
          AND "active" = true
      `,
    ]);
    return [
      ...rows.map((row) => ({ userId: row.userId, societyId: row.societyId, role: toAppRole(row.role), active: row.active })),
      ...auditorRows.map((row) => ({ userId: row.userId, societyId: row.societyId, role: AppRole.AUDITOR, active: true })),
    ];
  }

  async hasRole(userId: string, societyId: string, role: AppRole): Promise<boolean> {
    if (role === AppRole.AUDITOR) {
      const [row] = await this.prisma.$queryRaw<Array<{ present: boolean }>>`
        SELECT EXISTS(
          SELECT 1
          FROM "SocietyResponsibilityAssignment"
          WHERE "userId" = CAST(${userId} AS uuid)
            AND "societyId" = CAST(${societyId} AS uuid)
            AND "responsibility" = ${AUDITOR_RESPONSIBILITY}
            AND "active" = true
        ) AS "present"
      `;
      return row?.present ?? false;
    }
    const count = await this.prisma.societyMembership.count({ where: { userId, societyId, role: role as MembershipRole, active: true } });
    return count > 0;
  }
}
