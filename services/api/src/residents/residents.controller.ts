import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards, BadRequestException } from '@nestjs/common';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { MembershipRole, UnitRelation } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BearerGuard } from '../auth/bearer.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { AppPermission } from '../auth/permission.types';
import { CurrentTenant } from '../auth/tenant.decorator';

class LinkResidentDto {
  @IsUUID() userId!: string;
  @IsUUID() unitId!: string;
  @IsEnum(UnitRelation) relation!: UnitRelation;
  @IsOptional() @IsBoolean() isOccupant?: boolean;
  @IsOptional() @IsBoolean() primaryGateContact?: boolean;
  @IsOptional() @IsBoolean() gateApprovalEnabled?: boolean;
  @IsOptional() @IsBoolean() gateNotificationEnabled?: boolean;
  @IsOptional() @IsInt() @Min(0) escalationOrder?: number;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}
class CreateResidentDto { @IsString() @IsNotEmpty() phone!: string; @IsString() @IsNotEmpty() name!: string; }
class MembershipDto { @IsUUID() userId!: string; @IsEnum(MembershipRole) role!: MembershipRole; }
class EndOccupancyDto { @IsDateString() effectiveTo!: string; }

const membershipRoleForRelation = (relation: UnitRelation): MembershipRole => {
  if (relation === UnitRelation.OWNER) return MembershipRole.OWNER;
  if (relation === UnitRelation.TENANT) return MembershipRole.TENANT;
  return MembershipRole.FAMILY_MEMBER;
};

@Controller('residents')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class ResidentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_READ)
  list(@CurrentTenant() societyId: string) {
    return this.prisma.unitOccupancy.findMany({
      where: { societyId, active: true },
      select: {
        id: true, relation: true, effectiveFrom: true, effectiveTo: true, primaryGateContact: true,
        gateApprovalEnabled: true, gateNotificationEnabled: true, escalationOrder: true,
        user: { select: { id: true, name: true, status: true } },
        unit: { include: { building: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get('ownerships')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_READ)
  listOwnerships(@CurrentTenant() societyId: string) {
    return this.prisma.unitOwnership.findMany({
      where: { societyId, active: true },
      select: {
        id: true, verified: true, ownershipBps: true, effectiveFrom: true, effectiveTo: true,
        user: { select: { id: true, name: true, status: true } },
        unit: { include: { building: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
  create(@Body() dto: CreateResidentDto) {
    return this.prisma.user.upsert({ where: { phone: dto.phone.trim() }, update: { name: dto.name.trim() }, create: { phone: dto.phone.trim(), name: dto.name.trim() } });
  }

  @Post('link')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
  async link(@Body() dto: LinkResidentDto, @CurrentTenant() societyId: string) {
    const unit = await this.prisma.unit.findFirst({ where: { id: dto.unitId, building: { societyId } } });
    if (!unit) throw new BadRequestException('Unit does not belong to authenticated society');
    const role = membershipRoleForRelation(dto.relation);
    const isOccupant = dto.isOccupant ?? true;
    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    if (effectiveTo && effectiveTo <= effectiveFrom) throw new BadRequestException('Relationship validity window is invalid');
    if (dto.relation !== UnitRelation.OWNER && !isOccupant) throw new BadRequestException('Tenant and family relationships require active occupancy');
    return this.prisma.$transaction(async (tx) => {
      if (dto.relation === UnitRelation.OWNER) {
        await tx.unitOwnership.upsert({
          where: { unitId_userId: { unitId: dto.unitId, userId: dto.userId } },
          update: { societyId, active: true, effectiveFrom, effectiveTo },
          create: { societyId, unitId: dto.unitId, userId: dto.userId, effectiveFrom, effectiveTo },
        });
      }
      let occupancy = null;
      if (isOccupant) {
        const existingOccupants = await tx.unitOccupancy.count({ where: { societyId, unitId: dto.unitId, active: true } });
        const primaryGateContact = dto.primaryGateContact ?? existingOccupants === 0;
        if (primaryGateContact) {
          await tx.unitOccupancy.updateMany({
            where: { societyId, unitId: dto.unitId, active: true, primaryGateContact: true },
            data: { primaryGateContact: false },
          });
        }
        occupancy = await tx.unitOccupancy.upsert({
          where: { unitId_userId: { unitId: dto.unitId, userId: dto.userId } },
          update: {
            societyId, relation: dto.relation, active: true, effectiveFrom, effectiveTo,
            primaryGateContact,
            gateApprovalEnabled: dto.gateApprovalEnabled ?? true,
            gateNotificationEnabled: dto.gateNotificationEnabled ?? true,
            escalationOrder: dto.escalationOrder ?? 100,
          },
          create: {
            societyId, unitId: dto.unitId, userId: dto.userId, relation: dto.relation, effectiveFrom, effectiveTo,
            primaryGateContact,
            gateApprovalEnabled: dto.gateApprovalEnabled ?? true,
            gateNotificationEnabled: dto.gateNotificationEnabled ?? true,
            escalationOrder: dto.escalationOrder ?? 100,
          },
        });
      } else {
        await tx.unitOccupancy.updateMany({
          where: { societyId, unitId: dto.unitId, userId: dto.userId, active: true },
          data: { active: false, effectiveTo: effectiveFrom, gateApprovalEnabled: false, gateNotificationEnabled: false },
        });
      }
      await tx.societyMembership.upsert({ where: { userId_societyId_role: { userId: dto.userId, societyId, role } }, update: { active: true }, create: { userId: dto.userId, societyId, role, active: true } });
      return { ownership: dto.relation === UnitRelation.OWNER, occupancy };
    });
  }

  @Patch('occupancies/:occupancyId/end')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
  async endOccupancy(
    @Param('occupancyId', ParseUUIDPipe) occupancyId: string,
    @Body() dto: EndOccupancyDto,
    @CurrentTenant() societyId: string,
  ) {
    const effectiveTo = new Date(dto.effectiveTo);
    const occupancy = await this.prisma.unitOccupancy.findFirst({ where: { id: occupancyId, societyId, active: true } });
    if (!occupancy) throw new BadRequestException('Active occupancy not found');
    if (effectiveTo <= occupancy.effectiveFrom) throw new BadRequestException('Move-out must be after move-in');
    return this.prisma.$transaction(async (tx) => {
      const ended = await tx.unitOccupancy.update({
        where: { id: occupancy.id },
        data: { active: false, effectiveTo, primaryGateContact: false, gateApprovalEnabled: false, gateNotificationEnabled: false },
      });
      if (occupancy.primaryGateContact) {
        const fallback = await tx.unitOccupancy.findFirst({
          where: { societyId, unitId: occupancy.unitId, active: true, gateNotificationEnabled: true },
          orderBy: [{ escalationOrder: 'asc' }, { createdAt: 'asc' }],
          select: { id: true },
        });
        if (fallback) await tx.unitOccupancy.update({ where: { id: fallback.id }, data: { primaryGateContact: true } });
      }
      return ended;
    });
  }

  @Post('membership')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
  membership(@Body() dto: MembershipDto, @CurrentTenant() societyId: string) {
    return this.prisma.societyMembership.upsert({ where: { userId_societyId_role: { userId: dto.userId, societyId, role: dto.role } }, update: { active: true }, create: { userId: dto.userId, societyId, role: dto.role, active: true } });
  }
}
