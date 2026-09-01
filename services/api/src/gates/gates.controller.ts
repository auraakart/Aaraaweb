import { Body, Controller, Get, Param, Post, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { BearerGuard } from '../auth/bearer.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { GateAccessGuard } from './gate-access.guard';
import { GateAuditService } from './gate-audit.service';

class CreateGateDto { @IsString() @IsNotEmpty() name!: string; @IsString() @IsNotEmpty() code!: string; @IsOptional() @IsBoolean() active?: boolean; }

@Controller('gates')
@UseGuards(BearerGuard, TenantGuard)
export class GatesController {
  constructor(private readonly prisma: PrismaService, private readonly audit: GateAuditService) {}

  @Get()
  list(@CurrentTenant() societyId: string) { return this.prisma.gate.findMany({ where: { societyId }, orderBy: { name: 'asc' } }); }

  @Get('audit')
  @UseGuards(GateAccessGuard)
  auditHistory(@CurrentTenant() societyId: string, @Query('gateId') gateId?: string, @Query('limit') limit?: string) {
    return this.audit.list(societyId, gateId, limit ? Number.parseInt(limit, 10) : 50);
  }

  @Post()
  @UseGuards(GateAccessGuard)
  async create(@Body() dto: CreateGateDto, @CurrentTenant() societyId: string) {
    const code = dto.code.trim().toUpperCase();
    if (await this.prisma.gate.findFirst({ where: { societyId, code } })) throw new BadRequestException('Gate code already exists in this society');
    return this.prisma.gate.create({ data: { societyId, name: dto.name.trim(), code, active: dto.active ?? true } });
  }

  @Post(':gateId/activate')
  @UseGuards(GateAccessGuard)
  async activate(@Param('gateId') gateId: string, @CurrentTenant() societyId: string) {
    const gate = await this.prisma.gate.findFirst({ where: { id: gateId, societyId } });
    if (!gate) throw new BadRequestException('Gate does not belong to authenticated society');
    return this.prisma.gate.update({ where: { id: gateId }, data: { active: true } });
  }

  @Post(':gateId/deactivate')
  @UseGuards(GateAccessGuard)
  async deactivate(@Param('gateId') gateId: string, @CurrentTenant() societyId: string) {
    const gate = await this.prisma.gate.findFirst({ where: { id: gateId, societyId } });
    if (!gate) throw new BadRequestException('Gate does not belong to authenticated society');
    return this.prisma.gate.update({ where: { id: gateId }, data: { active: false } });
  }
}
