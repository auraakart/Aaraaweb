import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsNotEmpty, IsPhoneNumber, IsString } from 'class-validator';
import { MembershipRole } from '@prisma/client';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { PrismaService } from '../prisma/prisma.service';

const AUDITOR_ROLE = 'AUDITOR' as const;
const AUDITOR_RESPONSIBILITY = 'READ_ONLY_AUDITOR';
const SOCIETY_ASSIGNABLE_OPERATIONAL_ROLES = new Set<MembershipRole>([
  MembershipRole.COMMITTEE_MEMBER,
  MembershipRole.FACILITY_MANAGER,
  MembershipRole.ACCOUNTANT,
  MembershipRole.SECURITY_SUPERVISOR,
  MembershipRole.SECURITY_GUARD,
  MembershipRole.STAFF,
]);
const SOCIETY_ASSIGNABLE_ROLES = [...SOCIETY_ASSIGNABLE_OPERATIONAL_ROLES, AUDITOR_ROLE] as const;
type SocietyAssignableRole = MembershipRole | typeof AUDITOR_ROLE;

type AuditorRoleRow = {
  id: string;
  createdAt: Date;
  userId: string;
  name: string | null;
  phone: string;
  email: string | null;
  status: string;
};

class ProvisionOperationalRoleDto {
  @IsPhoneNumber()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsIn(SOCIETY_ASSIGNABLE_ROLES)
  role!: SocietyAssignableRole;
}

@Controller('society-roles')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class SocietyRolesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_READ)
  async list(@CurrentTenant() societyId: string) {
    const [memberships, auditorRows] = await Promise.all([
      this.prisma.societyMembership.findMany({
        where: { societyId, active: true, role: { in: [...SOCIETY_ASSIGNABLE_OPERATIONAL_ROLES] } },
        select: {
          id: true,
          role: true,
          active: true,
          createdAt: true,
          user: { select: { id: true, name: true, phone: true, email: true, status: true } },
        },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.$queryRaw<AuditorRoleRow[]>`
        SELECT
          assignment."id",
          assignment."createdAt",
          user_record."id" AS "userId",
          user_record."name",
          user_record."phone",
          user_record."email",
          user_record."status"::text AS "status"
        FROM "SocietyResponsibilityAssignment" assignment
        JOIN "User" user_record ON user_record."id" = assignment."userId"
        WHERE assignment."societyId" = CAST(${societyId} AS uuid)
          AND assignment."responsibility" = ${AUDITOR_RESPONSIBILITY}
          AND assignment."active" = true
        ORDER BY assignment."createdAt" ASC
      `,
    ]);

    return [
      ...memberships,
      ...auditorRows.map((row) => ({
        id: row.id,
        role: AUDITOR_ROLE,
        active: true,
        createdAt: row.createdAt,
        user: { id: row.userId, name: row.name, phone: row.phone, email: row.email, status: row.status },
      })),
    ].sort((left, right) => String(left.role).localeCompare(String(right.role)) || left.createdAt.getTime() - right.createdAt.getTime());
  }

  @Post()
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
  async provision(@Body() dto: ProvisionOperationalRoleDto, @CurrentTenant() societyId: string) {
    this.assertAssignable(dto.role);
    const phone = dto.phone.replace(/\s+/g, '');
    let user = await this.prisma.user.findUnique({ where: { phone }, select: { id: true, status: true, name: true, phone: true } });
    if (!user) {
      user = await this.prisma.user.create({
        data: { phone, name: dto.name.trim() },
        select: { id: true, status: true, name: true, phone: true },
      });
    }
    if (user.status !== 'ACTIVE') throw new BadRequestException('User is not active');

    if (dto.role === AUDITOR_ROLE) {
      const [assignment] = await this.prisma.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "SocietyResponsibilityAssignment" (
          "societyId", "userId", "responsibility", "active", "updatedAt"
        ) VALUES (
          CAST(${societyId} AS uuid), CAST(${user.id} AS uuid), ${AUDITOR_RESPONSIBILITY}, true, CURRENT_TIMESTAMP
        )
        ON CONFLICT ("societyId", "userId", "responsibility")
        DO UPDATE SET "active" = true, "updatedAt" = CURRENT_TIMESTAMP
        RETURNING "id"
      `;
      if (!assignment) throw new BadRequestException('Auditor responsibility could not be assigned');
      return {
        id: assignment.id,
        role: AUDITOR_ROLE,
        active: true,
        user: { id: user.id, name: user.name, phone: user.phone, status: user.status },
      };
    }

    return this.prisma.societyMembership.upsert({
      where: { userId_societyId_role: { userId: user.id, societyId, role: dto.role } },
      update: { active: true },
      create: { userId: user.id, societyId, role: dto.role, active: true },
      select: { id: true, role: true, active: true, user: { select: { id: true, name: true, phone: true, status: true } } },
    });
  }

  @Patch(':membershipId/deactivate')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
  async deactivate(
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @CurrentTenant() societyId: string,
  ) {
    const membership = await this.prisma.societyMembership.findFirst({
      where: { id: membershipId, societyId, active: true },
      select: { id: true, userId: true, role: true },
    });

    if (membership) {
      this.assertAssignable(membership.role);
      return this.prisma.$transaction(async (tx) => {
        await tx.societyMembership.update({ where: { id: membership.id }, data: { active: false } });
        await tx.session.updateMany({
          where: { userId: membership.userId, societyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return { success: true };
      });
    }

    const [auditor] = await this.prisma.$queryRaw<Array<{ id: string; userId: string }>>`
      SELECT "id", "userId"
      FROM "SocietyResponsibilityAssignment"
      WHERE "id" = CAST(${membershipId} AS uuid)
        AND "societyId" = CAST(${societyId} AS uuid)
        AND "responsibility" = ${AUDITOR_RESPONSIBILITY}
        AND "active" = true
      LIMIT 1
    `;
    if (!auditor) throw new BadRequestException('Active society role not found');

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "SocietyResponsibilityAssignment"
        SET "active" = false, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = CAST(${auditor.id} AS uuid)
      `;
      await tx.session.updateMany({
        where: { userId: auditor.userId, societyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return { success: true };
    });
  }

  private assertAssignable(role: SocietyAssignableRole) {
    if (role === AUDITOR_ROLE) return;
    if (!SOCIETY_ASSIGNABLE_OPERATIONAL_ROLES.has(role)) {
      throw new BadRequestException('Role is not assignable by society administration');
    }
  }
}
