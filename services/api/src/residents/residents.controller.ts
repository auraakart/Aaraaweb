import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards, BadRequestException } from '@nestjs/common';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { MembershipRole, Prisma, UnitRelation } from '@prisma/client';
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
class EndOwnershipDto {
  @IsDateString() effectiveTo!: string;
  @IsOptional() @IsEnum(UnitRelation) continuingOccupantRelation?: UnitRelation;
  @IsOptional() @IsBoolean() endOccupancy?: boolean;
}

const membershipRoleForRelation = (relation: UnitRelation): MembershipRole => {
  if (relation === UnitRelation.OWNER) return MembershipRole.OWNER;
  if (relation === UnitRelation.TENANT) return MembershipRole.TENANT;
  return MembershipRole.FAMILY_MEMBER;
};

const RELATIONSHIP_ROLES = [MembershipRole.OWNER, MembershipRole.TENANT, MembershipRole.FAMILY_MEMBER] as const;

@Controller('residents')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class ResidentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_READ)
  list(@CurrentTenant() societyId: string) {
    const now = new Date();
    return this.prisma.unitOccupancy.findMany({
      where: { societyId, active: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
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
    const now = new Date();
    return this.prisma.unitOwnership.findMany({
      where: { societyId, active: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
      select: {
        id: true, verified: true, ownershipBps: true, effectiveFrom: true, effectiveTo: true,
        user: { select: { id: true, name: true, status: true } },
        unit: { include: { building: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get('history')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_READ)
  async history(@CurrentTenant() societyId: string) {
    const [occupancies, ownerships] = await Promise.all([
      this.prisma.unitOccupancy.findMany({
        where: { societyId },
        select: {
          id: true, active: true, relation: true, effectiveFrom: true, effectiveTo: true,
          primaryGateContact: true, gateApprovalEnabled: true, gateNotificationEnabled: true, escalationOrder: true,
          user: { select: { id: true, name: true, status: true } },
          unit: { include: { building: true } },
        },
        orderBy: { effectiveFrom: 'desc' },
      }),
      this.prisma.unitOwnership.findMany({
        where: { societyId },
        select: {
          id: true, active: true, verified: true, ownershipBps: true, effectiveFrom: true, effectiveTo: true,
          user: { select: { id: true, name: true, status: true } },
          unit: { include: { building: true } },
        },
        orderBy: { effectiveFrom: 'desc' },
      }),
    ]);
    return { occupancies, ownerships };
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
    const now = new Date();
    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    if (effectiveTo && effectiveTo <= effectiveFrom) throw new BadRequestException('Relationship validity window is invalid');
    if (effectiveFrom > now) throw new BadRequestException('Future relationship activation is not supported; link the resident on the move-in date');
    if (effectiveTo) throw new BadRequestException('Scheduled relationship termination is not supported; use the end endpoint on the effective date');
    if (dto.relation !== UnitRelation.OWNER && !isOccupant) throw new BadRequestException('Tenant and family relationships require active occupancy');
    return this.prisma.$transaction(async (tx) => {
      await tx.unitOwnership.updateMany({
        where: { societyId, unitId: dto.unitId, userId: dto.userId, active: true, effectiveTo: { lte: now } },
        data: { active: false },
      });
      await tx.unitOccupancy.updateMany({
        where: { societyId, unitId: dto.unitId, userId: dto.userId, active: true, effectiveTo: { lte: now } },
        data: { active: false, primaryGateContact: false, gateApprovalEnabled: false, gateNotificationEnabled: false },
      });
      if (dto.relation === UnitRelation.OWNER) {
        const ownership = await tx.unitOwnership.findFirst({ where: { societyId, unitId: dto.unitId, userId: dto.userId, active: true } });
        if (ownership) {
          await tx.unitOwnership.update({ where: { id: ownership.id }, data: { effectiveFrom, effectiveTo } });
        } else {
          await tx.unitOwnership.create({ data: { societyId, unitId: dto.unitId, userId: dto.userId, effectiveFrom, effectiveTo } });
        }
      }
      let occupancy = null;
      if (isOccupant) {
        const currentWindow = { effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] };
        const currentOccupancy = await tx.unitOccupancy.findFirst({
          where: { societyId, unitId: dto.unitId, userId: dto.userId, active: true },
        });
        const otherOccupants = await tx.unitOccupancy.count({
          where: { societyId, unitId: dto.unitId, userId: { not: dto.userId }, active: true, ...currentWindow },
        });
        const primaryGateContact = otherOccupants === 0
          ? true
          : (dto.primaryGateContact ?? currentOccupancy?.primaryGateContact ?? false);
        if (primaryGateContact) {
          await tx.unitOccupancy.updateMany({
            where: { societyId, unitId: dto.unitId, active: true, primaryGateContact: true },
            data: { primaryGateContact: false },
          });
        }
        const occupancyData = {
            societyId, relation: dto.relation, active: true, effectiveFrom, effectiveTo,
            primaryGateContact,
            gateApprovalEnabled: dto.gateApprovalEnabled ?? true,
            gateNotificationEnabled: primaryGateContact ? true : (dto.gateNotificationEnabled ?? true),
            escalationOrder: dto.escalationOrder ?? 100,
        };
        occupancy = currentOccupancy
          ? await tx.unitOccupancy.update({ where: { id: currentOccupancy.id }, data: occupancyData })
          : await tx.unitOccupancy.create({ data: { unitId: dto.unitId, userId: dto.userId, ...occupancyData } });
      } else {
        const endingPrimary = await tx.unitOccupancy.findFirst({
          where: { societyId, unitId: dto.unitId, userId: dto.userId, active: true, primaryGateContact: true },
          select: { id: true },
        });
        await tx.unitOccupancy.updateMany({
          where: { societyId, unitId: dto.unitId, userId: dto.userId, active: true },
          data: { active: false, effectiveTo: now, primaryGateContact: false, gateApprovalEnabled: false, gateNotificationEnabled: false },
        });
        if (endingPrimary) await this.assignFallbackPrimary(tx, societyId, dto.unitId, now);
      }
      await tx.societyMembership.upsert({ where: { userId_societyId_role: { userId: dto.userId, societyId, role } }, update: { active: true }, create: { userId: dto.userId, societyId, role, active: true } });
      await this.syncRelationshipMemberships(tx, societyId, dto.userId, now);
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
    const now = new Date();
    const occupancy = await this.prisma.unitOccupancy.findFirst({ where: { id: occupancyId, societyId, active: true } });
    if (!occupancy) throw new BadRequestException('Active occupancy not found');
    if (effectiveTo <= occupancy.effectiveFrom) throw new BadRequestException('Move-out must be after move-in');
    if (effectiveTo > now) throw new BadRequestException('Future move-out is not supported; end occupancy on the move-out date');
    return this.prisma.$transaction(async (tx) => {
      const ended = await tx.unitOccupancy.update({
        where: { id: occupancy.id },
        data: { active: false, effectiveTo, primaryGateContact: false, gateApprovalEnabled: false, gateNotificationEnabled: false },
      });
      if (occupancy.primaryGateContact) {
        await this.assignFallbackPrimary(tx, societyId, occupancy.unitId, now);
      }
      await this.syncRelationshipMemberships(tx, societyId, occupancy.userId, now);
      return ended;
    });
  }

  @Patch('ownerships/:ownershipId/end')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
  async endOwnership(
    @Param('ownershipId', ParseUUIDPipe) ownershipId: string,
    @Body() dto: EndOwnershipDto,
    @CurrentTenant() societyId: string,
  ) {
    const effectiveTo = new Date(dto.effectiveTo);
    const now = new Date();
    const ownership = await this.prisma.unitOwnership.findFirst({ where: { id: ownershipId, societyId, active: true } });
    if (!ownership) throw new BadRequestException('Active ownership not found');
    if (effectiveTo <= ownership.effectiveFrom) throw new BadRequestException('Ownership end must be after its start');
    if (effectiveTo > now) throw new BadRequestException('Future ownership termination is not supported; end ownership on the transfer date');
    const occupancy = await this.prisma.unitOccupancy.findFirst({
      where: {
        societyId, unitId: ownership.unitId, userId: ownership.userId, relation: UnitRelation.OWNER, active: true,
        effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
    });
    if (occupancy && dto.endOccupancy === (dto.continuingOccupantRelation !== undefined)) {
      throw new BadRequestException('Choose either move-out or tenant/family status when ending resident ownership');
    }
    if (dto.continuingOccupantRelation === UnitRelation.OWNER) {
      throw new BadRequestException('Continuing occupants must become a tenant or family member');
    }
    return this.prisma.$transaction(async (tx) => {
      const ended = await tx.unitOwnership.update({ where: { id: ownership.id }, data: { active: false, effectiveTo } });
      if (occupancy && dto.endOccupancy) {
        await tx.unitOccupancy.update({
          where: { id: occupancy.id },
          data: { active: false, effectiveTo, primaryGateContact: false, gateApprovalEnabled: false, gateNotificationEnabled: false },
        });
        if (occupancy.primaryGateContact) await this.assignFallbackPrimary(tx, societyId, occupancy.unitId, now);
      } else if (occupancy && dto.continuingOccupantRelation) {
        await tx.unitOccupancy.update({ where: { id: occupancy.id }, data: { relation: dto.continuingOccupantRelation } });
      }
      await this.syncRelationshipMemberships(tx, societyId, ownership.userId, now);
      return ended;
    });
  }

  @Post('membership')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
  membership(@Body() dto: MembershipDto, @CurrentTenant() societyId: string) {
    if ((RELATIONSHIP_ROLES as readonly MembershipRole[]).includes(dto.role)) {
      throw new BadRequestException('Owner, tenant and family roles must be managed through a unit relationship');
    }
    return this.prisma.societyMembership.upsert({ where: { userId_societyId_role: { userId: dto.userId, societyId, role: dto.role } }, update: { active: true }, create: { userId: dto.userId, societyId, role: dto.role, active: true } });
  }

  private async assignFallbackPrimary(tx: Prisma.TransactionClient, societyId: string, unitId: string, now: Date) {
    const fallback = await tx.unitOccupancy.findFirst({
      where: {
        societyId, unitId, active: true, gateNotificationEnabled: true,
        effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      orderBy: [{ escalationOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    if (fallback) await tx.unitOccupancy.update({ where: { id: fallback.id }, data: { primaryGateContact: true } });
  }

  private async syncRelationshipMemberships(tx: Prisma.TransactionClient, societyId: string, userId: string, now: Date) {
    const [owner, tenant, family] = await Promise.all([
      tx.unitOwnership.count({ where: { societyId, userId, active: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] } }),
      tx.unitOccupancy.count({ where: { societyId, userId, relation: UnitRelation.TENANT, active: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] } }),
      tx.unitOccupancy.count({ where: { societyId, userId, relation: UnitRelation.FAMILY_MEMBER, active: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] } }),
    ]);
    const supported = new Set<MembershipRole>();
    if (owner) supported.add(MembershipRole.OWNER);
    if (tenant) supported.add(MembershipRole.TENANT);
    if (family) supported.add(MembershipRole.FAMILY_MEMBER);
    for (const relationshipRole of RELATIONSHIP_ROLES) {
      if (supported.has(relationshipRole)) {
        await tx.societyMembership.upsert({
          where: { userId_societyId_role: { userId, societyId, role: relationshipRole } },
          update: { active: true },
          create: { userId, societyId, role: relationshipRole, active: true },
        });
      } else {
        await tx.societyMembership.updateMany({ where: { userId, societyId, role: relationshipRole, active: true }, data: { active: false } });
      }
    }
    const remainingMemberships = await tx.societyMembership.count({ where: { userId, societyId, active: true } });
    if (!remainingMemberships) {
      await tx.session.updateMany({ where: { userId, societyId, revokedAt: null }, data: { revokedAt: now } });
    }
  }
}
