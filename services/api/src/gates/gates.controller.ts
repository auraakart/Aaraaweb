import { Body, Controller, Get, Param, Post, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { BearerGuard } from '../auth/bearer.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { AppPermission } from '../auth/permission.types';
import { GateAuditService } from './gate-audit.service';

class CreateGateDto { @IsString() @IsNotEmpty() name!: string; @IsString() @IsNotEmpty() code!: string; @IsOptional() @IsBoolean() active?: boolean; }

@Controller('gates')
@UseGuards(BearerGuard, TenantGuard)
export class GatesController {
  constructor(private readonly prisma: PrismaService, private readonly audit: GateAuditService) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @RequiresPermissions(AppPermission.GATE_READ)
  list(@CurrentTenant() societyId: string) { return this.prisma.gate.findMany({ where: { societyId }, orderBy: { name: 'asc' } }); }

  @Get('audit')
  @UseGuards(PermissionsGuard)
  @RequiresPermissions(AppPermission.AUDIT_READ)
  auditHistory(@CurrentTenant() societyId: string, @Query('gateId') gateId?: string, @Query('limit') limit?: string) {
    return this.audit.list(societyId, gateId, limit ? Number.parseInt(limit, 10) : 50);
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequiresPermissions(AppPermission.GATE_MANAGE)
  async create(@Body() dto: CreateGateDto, @CurrentTenant() societyId: string) {
    const code = dto.code.trim().toUpperCase();
    if (await this.prisma.gate.findFirst({ where: { societyId, code } })) throw new BadRequestException('Gate code already exists in this society');
    return this.prisma.gate.create({ data: { societyId, name: dto.name.trim(), code, active: dto.active ?? true } });
  }

  @Post(':gateId/activate')
  @UseGuards(PermissionsGuard)
  @RequiresPermissions(AppPermission.GATE_MANAGE)
  async activate(@Param('gateId') gateId: string, @CurrentTenant() societyId: string) {
    const gate = await this.prisma.gate.findFirst({ where: { id: gateId, societyId } });
    if (!gate) throw new BadRequestException('Gate does not belong to authenticated society');
    return this.prisma.gate.update({ where: { id: gateId }, data: { active: true } });
  }

  @Post(':gateId/deactivate')
  @UseGuards(PermissionsGuard)
  @RequiresPermissions(AppPermission.GATE_MANAGE)
  async deactivate(@Param('gateId') gateId: string, @CurrentTenant() societyId: string) {
    const gate = await this.prisma.gate.findFirst({ where: { id: gateId, societyId } });
    if (!gate) throw new BadRequestException('Gate does not belong to authenticated society');
    return this.prisma.gate.update({ where: { id: gateId }, data: { active: false } });
  }
}
