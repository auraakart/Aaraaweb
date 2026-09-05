import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsPhoneNumber, IsString, IsUUID } from 'class-validator';
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

class ProvisionSocietyAdminDto {
  @IsPhoneNumber()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;
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

  @Get('societies/:societyId/admins')
  listSocietyAdmins(@Param('societyId', ParseUUIDPipe) societyId: string) {
    return this.prisma.societyMembership.findMany({
      where: { societyId, role: MembershipRole.SOCIETY_ADMIN, active: true },
      select: {
        id: true,
        userId: true,
        role: true,
        active: true,
        createdAt: true,
        user: { select: { name: true, phone: true, email: true, status: true } },
      },
      orderBy: { createdAt: 'asc' },
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
    return this.upsertSocietyAdmin(societyId, dto.userId);
  }

  @Post('societies/:societyId/admins/provision')
  async provisionSocietyAdmin(
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Body() dto: ProvisionSocietyAdminDto,
  ) {
    const society = await this.prisma.society.findUnique({ where: { id: societyId }, select: { id: true } });
    if (!society) throw new BadRequestException('Society not found');
    const phone = dto.phone.replace(/\s+/g, '');
    let user = await this.prisma.user.findUnique({ where: { phone }, select: { id: true, status: true } });
    if (!user) {
      user = await this.prisma.user.create({
        data: { phone, name: dto.name.trim() },
        select: { id: true, status: true },
      });
    }
    if (user.status !== 'ACTIVE') throw new BadRequestException('User is not active');
    return this.upsertSocietyAdmin(societyId, user.id);
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

  private upsertSocietyAdmin(societyId: string, userId: string) {
    return this.prisma.societyMembership.upsert({
      where: { userId_societyId_role: { userId, societyId, role: MembershipRole.SOCIETY_ADMIN } },
      update: { active: true },
      create: { userId, societyId, role: MembershipRole.SOCIETY_ADMIN, active: true },
      select: { id: true, userId: true, societyId: true, role: true, active: true },
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
