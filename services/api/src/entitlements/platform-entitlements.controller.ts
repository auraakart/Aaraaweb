import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { IsEnum, IsObject, IsOptional, IsUUID } from 'class-validator';
import { MembershipRole, SocietyStatus } from '@prisma/client';
import { AppRole } from '../auth/auth.types';
import { BearerGuard } from '../auth/bearer.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ProductFeature, ProductTier } from './entitlement.types';

class UpdateEntitlementsDto {
  @IsEnum(ProductTier)
  @IsOptional()
  productTier?: ProductTier;

  @IsObject()
  @IsOptional()
  featureOverrides?: Record<string, unknown>;
}

class UpdateSocietyStatusDto {
  @IsEnum(SocietyStatus)
  status!: SocietyStatus;
}

class AssignSocietyAdminDto {
  @IsUUID()
  userId!: string;
}

@Controller('platform')
@UseGuards(BearerGuard, RolesGuard)
@Roles(AppRole.SUPER_ADMIN)
export class PlatformEntitlementsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('societies')
  listSocieties() {
    return this.prisma.society.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
        status: true,
        productTier: true,
        featureOverrides: true,
        _count: { select: { memberships: true, buildings: true, gates: true } },
      },
    });
  }

  @Patch('societies/:societyId/entitlements')
  async updateEntitlements(
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Body() dto: UpdateEntitlementsDto,
  ) {
    const featureOverrides = dto.featureOverrides === undefined
      ? undefined
      : this.validateFeatureOverrides(dto.featureOverrides);
    return this.prisma.society.update({
      where: { id: societyId },
      data: {
        ...(dto.productTier ? { productTier: dto.productTier } : {}),
        ...(featureOverrides !== undefined ? { featureOverrides } : {}),
      },
      select: { id: true, name: true, code: true, status: true, productTier: true, featureOverrides: true },
    });
  }

  @Patch('societies/:societyId/status')
  updateSocietyStatus(
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Body() dto: UpdateSocietyStatusDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const society = await tx.society.update({
        where: { id: societyId },
        data: { status: dto.status },
        select: { id: true, name: true, code: true, status: true, productTier: true },
      });
      if (dto.status === SocietyStatus.SUSPENDED) {
        await tx.session.updateMany({ where: { societyId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      return society;
    });
  }

  @Post('societies/:societyId/admins')
  async assignSocietyAdmin(
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Body() dto: AssignSocietyAdminDto,
  ) {
    const [society, user] = await Promise.all([
      this.prisma.society.findUnique({ where: { id: societyId }, select: { id: true } }),
      this.prisma.user.findUnique({ where: { id: dto.userId }, select: { id: true, status: true } }),
    ]);
    if (!society) throw new BadRequestException('Society not found');
    if (!user || user.status !== 'ACTIVE') throw new BadRequestException('Active user not found');
    return this.prisma.societyMembership.upsert({
      where: { userId_societyId_role: { userId: dto.userId, societyId, role: MembershipRole.SOCIETY_ADMIN } },
      update: { active: true },
      create: { userId: dto.userId, societyId, role: MembershipRole.SOCIETY_ADMIN, active: true },
      select: { id: true, userId: true, societyId: true, role: true, active: true },
    });
  }

  @Patch('societies/:societyId/admins/:userId/deactivate')
  deactivateSocietyAdmin(
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.societyMembership.updateMany({
        where: { userId, societyId, role: MembershipRole.SOCIETY_ADMIN, active: true },
        data: { active: false },
      });
      if (result.count > 0) {
        await tx.session.updateMany({ where: { userId, societyId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      return { success: true, deactivated: result.count };
    });
  }

  private validateFeatureOverrides(input: Record<string, unknown>) {
    const allowed = new Set<string>(Object.values(ProductFeature));
    const output: Partial<Record<ProductFeature, boolean>> = {};
    for (const [key, value] of Object.entries(input)) {
      if (!allowed.has(key)) throw new BadRequestException(`Unknown product feature: ${key}`);
      if (typeof value !== 'boolean') throw new BadRequestException(`Feature override ${key} must be boolean`);
      output[key as ProductFeature] = value;
    }
    return output;
  }
}
