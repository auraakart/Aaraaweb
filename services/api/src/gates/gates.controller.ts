import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { PrismaService } from '../prisma/prisma.service';
import { GateAssignmentService } from './gate-assignment.service';
import { GateAuditService } from './gate-audit.service';

class CreateGateDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() code!: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

class AssignGuardDto {
  @IsUUID() userId!: string;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

@Controller('gates')
@UseGuards(BearerGuard, TenantGuard)
export class GatesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: GateAuditService,
    private readonly assignments: GateAssignmentService,
  ) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @RequiresPermissions(AppPermission.GATE_READ)
  list(@CurrentTenant() societyId: string) {
    return this.prisma.gate.findMany({ where: { societyId }, orderBy: { name: 'asc' } });
  }

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
    if (await this.prisma.gate.findFirst({ where: { societyId, code } })) {
      throw new BadRequestException('Gate code already exists in this society');
    }
    return this.prisma.gate.create({ data: { societyId, name: dto.name.trim(), code, active: dto.active ?? true } });
  }

  @Get(':gateId/assignments')
  @UseGuards(PermissionsGuard)
  @RequiresPermissions(AppPermission.GATE_MANAGE)
  listAssignments(@Param('gateId') gateId: string, @CurrentTenant() societyId: string) {
    return this.assignments.list(societyId, gateId);
  }

  @Post(':gateId/assignments')
  @UseGuards(PermissionsGuard)
  @RequiresPermissions(AppPermission.GATE_MANAGE)
  assignGuard(@Param('gateId') gateId: string, @Body() dto: AssignGuardDto, @CurrentTenant() societyId: string) {
    return this.assignments.assign(
      societyId,
      gateId,
      dto.userId,
      dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
      dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
    );
  }

  @Post(':gateId/assignments/:assignmentId/deactivate')
  @UseGuards(PermissionsGuard)
  @RequiresPermissions(AppPermission.GATE_MANAGE)
  deactivateAssignment(
    @Param('gateId') gateId: string,
    @Param('assignmentId') assignmentId: string,
    @CurrentTenant() societyId: string,
  ) {
    return this.assignments.deactivate(societyId, gateId, assignmentId);
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
