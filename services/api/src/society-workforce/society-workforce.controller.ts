import { BadRequestException, Body, Controller, ExecutionContext, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards, createParamDecorator } from '@nestjs/common';
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

class WorkerReasonDto {
  @IsOptional() @IsString() reason?: string;
}

class CreateSocietyWorkerLeaveDto {
  @IsDateString() startsOn!: string;
  @IsDateString() endsOn!: string;
  @IsOptional() @IsString() reason?: string;
}

class AttendanceCorrectionDto {
  @IsOptional() @IsDateString() checkedInAt?: string;
  @IsOptional() @IsDateString() checkedOutAt?: string;
  @IsString() @IsNotEmpty() reason!: string;
}

class GateSocietyWorkforceQueryDto {
  @IsUUID() gateId!: string;
  @IsOptional() @IsString() query?: string;
}

class GateSocietyWorkforceLookupDto {
  @IsUUID() gateId!: string;
  @IsString() @IsNotEmpty() query!: string;
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

  @Get('summary')
  @RequiresPermissions(AppPermission.SOCIETY_WORKFORCE_READ)
  summary(@CurrentTenant() societyId: string) {
    return this.workforce.operationsSummary(societyId);
  }

  @Get('attendance')
  @RequiresPermissions(AppPermission.SOCIETY_WORKFORCE_READ)
  attendance(
    @CurrentTenant() societyId: string,
    @Query('workerId') workerId?: string,
    @Query('gateId') gateId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('insideOnly') insideOnly?: string,
  ) {
    return this.workforce.attendance(societyId, {
      workerId: workerId?.trim() || undefined,
      gateId: gateId?.trim() || undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      insideOnly: insideOnly === 'true',
    });
  }

  @Get('leaves')
  @RequiresPermissions(AppPermission.SOCIETY_WORKFORCE_READ)
  leaves(@CurrentTenant() societyId: string, @Query('workerId') workerId?: string) {
    return this.workforce.leaves(societyId, workerId?.trim() || undefined);
  }

  @Get(':workerId/timeline')
  @RequiresPermissions(AppPermission.SOCIETY_WORKFORCE_READ)
  timeline(@Param('workerId', ParseUUIDPipe) workerId: string, @CurrentTenant() societyId: string) {
    return this.workforce.timeline(societyId, workerId);
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
    @CurrentUser() actorUserId?: string,
  ) {
    if (!actorUserId) throw new BadRequestException('Authenticated society operator is required');
    return this.workforce.configure(societyId, workerId, actorUserId, {
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
  suspend(
    @Param('workerId', ParseUUIDPipe) workerId: string,
    @Body() dto: WorkerReasonDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() actorUserId?: string,
  ) {
    if (!actorUserId) throw new BadRequestException('Authenticated society operator is required');
    return this.workforce.suspend(societyId, workerId, actorUserId, dto.reason);
  }

  @Patch(':workerId/reactivate')
  @RequiresPermissions(AppPermission.SOCIETY_WORKFORCE_MANAGE)
  reactivate(
    @Param('workerId', ParseUUIDPipe) workerId: string,
    @Body() dto: WorkerReasonDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() actorUserId?: string,
  ) {
    if (!actorUserId) throw new BadRequestException('Authenticated society operator is required');
    return this.workforce.reactivate(societyId, workerId, actorUserId, dto.reason);
  }

  @Post(':workerId/leaves')
  @RequiresPermissions(AppPermission.SOCIETY_WORKFORCE_MANAGE)
  addLeave(
    @Param('workerId', ParseUUIDPipe) workerId: string,
    @Body() dto: CreateSocietyWorkerLeaveDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() actorUserId?: string,
  ) {
    if (!actorUserId) throw new BadRequestException('Authenticated society operator is required');
    return this.workforce.addLeave(
      societyId,
      workerId,
      actorUserId,
      new Date(`${dto.startsOn.slice(0, 10)}T00:00:00.000Z`),
      new Date(`${dto.endsOn.slice(0, 10)}T00:00:00.000Z`),
      dto.reason,
    );
  }

  @Patch('leaves/:leaveId/cancel')
  @RequiresPermissions(AppPermission.SOCIETY_WORKFORCE_MANAGE)
  cancelLeave(
    @Param('leaveId', ParseUUIDPipe) leaveId: string,
    @Body() dto: WorkerReasonDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() actorUserId?: string,
  ) {
    if (!actorUserId) throw new BadRequestException('Authenticated society operator is required');
    return this.workforce.cancelLeave(societyId, leaveId, actorUserId, dto.reason);
  }

  @Patch('attendance/:attendanceId/correct')
  @RequiresPermissions(AppPermission.SOCIETY_WORKFORCE_MANAGE)
  correctAttendance(
    @Param('attendanceId', ParseUUIDPipe) attendanceId: string,
    @Body() dto: AttendanceCorrectionDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() actorUserId?: string,
  ) {
    if (!actorUserId) throw new BadRequestException('Authenticated society operator is required');
    return this.workforce.correctAttendance(societyId, attendanceId, actorUserId, {
      checkedInAt: dto.checkedInAt ? new Date(dto.checkedInAt) : undefined,
      checkedOutAt: dto.checkedOutAt ? new Date(dto.checkedOutAt) : undefined,
      reason: dto.reason,
    });
  }

  @Post('gate/eligible')
  @UseGuards(GateAssignmentGuard)
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  gateEligible(@Body() dto: GateSocietyWorkforceQueryDto, @CurrentTenant() societyId: string) {
    return this.workforce.gateEligible(societyId, dto.gateId, dto.query);
  }

  @Post('gate/lookup')
  @UseGuards(GateAssignmentGuard)
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  gateLookup(@Body() dto: GateSocietyWorkforceLookupDto, @CurrentTenant() societyId: string) {
    return this.workforce.gateLookup(societyId, dto.gateId, dto.query);
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
