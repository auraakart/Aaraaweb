import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { IsEnum, IsNotEmpty, IsPhoneNumber, IsString } from 'class-validator';
import { MembershipRole } from '@prisma/client';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { PrismaService } from '../prisma/prisma.service';

const SOCIETY_ASSIGNABLE_OPERATIONAL_ROLES = new Set<MembershipRole>([
  MembershipRole.COMMITTEE_MEMBER,
  MembershipRole.FACILITY_MANAGER,
  MembershipRole.ACCOUNTANT,
  MembershipRole.SECURITY_SUPERVISOR,
  MembershipRole.SECURITY_GUARD,
  MembershipRole.STAFF,
]);

class ProvisionOperationalRoleDto {
  @IsPhoneNumber()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(MembershipRole)
  role!: MembershipRole;
}

@Controller('society-roles')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class SocietyRolesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_READ)
  list(@CurrentTenant() societyId: string) {
    return this.prisma.societyMembership.findMany({
      where: { societyId, active: true, role: { in: [...SOCIETY_ASSIGNABLE_OPERATIONAL_ROLES] } },
      select: {
        id: true,
        role: true,
        active: true,
        createdAt: true,
        user: { select: { id: true, name: true, phone: true, email: true, status: true } },
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
  }

  @Post()
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
  async provision(@Body() dto: ProvisionOperationalRoleDto, @CurrentTenant() societyId: string) {
    this.assertAssignable(dto.role);
    const phone = dto.phone.replace(/\s+/g, '');
    let user = await this.prisma.user.findUnique({ where: { phone }, select: { id: true, status: true } });
    if (!user) {
      user = await this.prisma.user.create({
        data: { phone, name: dto.name.trim() },
        select: { id: true, status: true },
      });
    }
    if (user.status !== 'ACTIVE') throw new BadRequestException('User is not active');
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
    if (!membership) throw new BadRequestException('Active society role not found');
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

  private assertAssignable(role: MembershipRole) {
    if (!SOCIETY_ASSIGNABLE_OPERATIONAL_ROLES.has(role)) {
      throw new BadRequestException('Role is not assignable by society administration');
    }
  }
}
