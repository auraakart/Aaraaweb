import { BadRequestException, Body, Controller, ExecutionContext, Get, Headers, Param, ParseUUIDPipe, Patch, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsArray, IsDateString, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { GateAssignmentGuard } from '../gates/gate-assignment.guard';
import { SocietyWorkforceService } from './society-workforce.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class CreateSocietyWorkerDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() phone!: string;
  @IsString() @IsNotEmpty() role!: string;
  @IsString() @IsNotEmpty() department!: string;
  @IsOptional() @IsString() employer?: string;
  @IsArray() @IsUUID('4', { each: true }) gateIds!: string[];
  @IsOptional() @IsObject() schedule?: Record<string, unknown>;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
}

class ConfigureSocietyWorkerDto {
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() employer?: string | null;
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) gateIds?: string[];
  @IsOptional() @IsObject() schedule?: Record<string, unknown>;
  @IsOptional() @IsDateString() startDate?: string | null;
  @IsOptional() @IsDateString() endDate?: string | null;
}

class GateSocietyWorkforceQueryDto {
  @IsUUID() gateId!: string;
  @IsOptional() @IsString() query?: string;
}

class GateSocietyWorkforceMutationDto {
  @IsUUID() gateId!: string;
  @IsUUID() workerId!: string;
}

@Controller('society-workforce')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class SocietyWorkforceController {
  constructor(private readonly workforce: SocietyWorkforceService) {}

  @Get()
  @RequiresPermissions(AppPermission.SOCIETY_WORKFORCE_READ)
  list(@CurrentTenant() societyId: string) {
    return this.workforce.list(societyId);
  }

  @Get('attendance')
  @RequiresPermissions(AppPermission.SOCIETY_WORKFORCE_READ)
  attendance(@CurrentTenant() societyId: string) {
    return this.workforce.attendance(societyId);
  }

  @Post()
  @RequiresPermissions(AppPermission.SOCIETY_WORKFORCE_MANAGE)
  create(@Body() dto: CreateSocietyWorkerDto, @CurrentTenant() societyId: string, @CurrentUser() actorUserId?: string) {
    if (!actorUserId) throw new BadRequestException('Authenticated society operator is required');
    return this.workforce.create(societyId, actorUserId, {
      name: dto.name,
      phone: dto.phone,
      role: dto.role,
      department: dto.department,
      employer: dto.employer,
      gateIds: dto.gateIds,
      schedule: dto.schedule,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
    });
  }

  @Patch(':workerId/configure')
  @RequiresPermissions(AppPermission.SOCIETY_WORKFORCE_MANAGE)
  configure(
    @Param('workerId', ParseUUIDPipe) workerId: string,
    @Body() dto: ConfigureSocietyWorkerDto,
    @CurrentTenant() societyId: string,
  ) {
    return this.workforce.configure(societyId, workerId, {
      role: dto.role,
      department: dto.department,
      employer: dto.employer,
      gateIds: dto.gateIds,
      schedule: dto.schedule,
      startDate: dto.startDate === undefined ? undefined : dto.startDate === null ? null : new Date(dto.startDate),
      endDate: dto.endDate === undefined ? undefined : dto.endDate === null ? null : new Date(dto.endDate),
    });
  }

  @Patch(':workerId/verify')
  @RequiresPermissions(AppPermission.SOCIETY_WORKFORCE_MANAGE)
  verify(@Param('workerId', ParseUUIDPipe) workerId: string, @CurrentTenant() societyId: string, @CurrentUser() actorUserId?: string) {
    if (!actorUserId) throw new BadRequestException('Authenticated society operator is required');
    return this.workforce.verify(societyId, workerId, actorUserId);
  }

  @Patch(':workerId/reject')
  @RequiresPermissions(AppPermission.SOCIETY_WORKFORCE_MANAGE)
  reject(@Param('workerId', ParseUUIDPipe) workerId: string, @CurrentTenant() societyId: string, @CurrentUser() actorUserId?: string) {
    if (!actorUserId) throw new BadRequestException('Authenticated society operator is required');
    return this.workforce.reject(societyId, workerId, actorUserId);
  }

  @Patch(':workerId/suspend')
  @RequiresPermissions(AppPermission.SOCIETY_WORKFORCE_MANAGE)
  suspend(@Param('workerId', ParseUUIDPipe) workerId: string, @CurrentTenant() societyId: string) {
    return this.workforce.suspend(societyId, workerId);
  }

  @Patch(':workerId/reactivate')
  @RequiresPermissions(AppPermission.SOCIETY_WORKFORCE_MANAGE)
  reactivate(@Param('workerId', ParseUUIDPipe) workerId: string, @CurrentTenant() societyId: string) {
    return this.workforce.reactivate(societyId, workerId);
  }

  @Post('gate/eligible')
  @UseGuards(GateAssignmentGuard)
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  gateEligible(@Body() dto: GateSocietyWorkforceQueryDto, @CurrentTenant() societyId: string) {
    return this.workforce.gateEligible(societyId, dto.gateId, dto.query);
  }

  @Post('gate/check-in')
  @UseGuards(GateAssignmentGuard)
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  checkIn(
    @Body() dto: GateSocietyWorkforceMutationDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentTenant() societyId: string,
    @CurrentUser() actorUserId?: string,
  ) {
    if (!actorUserId) throw new BadRequestException('Authenticated guard is required');
    return this.workforce.checkIn(societyId, dto.gateId, dto.workerId, actorUserId, idempotencyKey ?? '');
  }

  @Post('gate/check-out')
  @UseGuards(GateAssignmentGuard)
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  checkOut(
    @Body() dto: GateSocietyWorkforceMutationDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentTenant() societyId: string,
    @CurrentUser() actorUserId?: string,
  ) {
    if (!actorUserId) throw new BadRequestException('Authenticated guard is required');
    return this.workforce.checkOut(societyId, dto.gateId, dto.workerId, actorUserId, idempotencyKey ?? '');
  }
}
