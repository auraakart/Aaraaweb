import { BadRequestException, Body, Controller, ExecutionContext, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards, createParamDecorator } from '@nestjs/common';
import { AccessRequest, DomesticWorkerRole } from '@prisma/client';
import { IsDateString, IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { AccessRealtimeEvent, NotificationRealtimeService } from '../notifications/notification-realtime.service';
import { WorkforceService } from './workforce.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class AddWorkerDto {
  @IsUUID() householdId!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() phone!: string;
  @IsEnum(DomesticWorkerRole) role!: DomesticWorkerRole;
  @IsOptional() @IsObject() schedule?: Record<string, unknown>;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
}

class GateWorkforceDto {
  @IsUUID() gateId!: string;
  @IsUUID() assignmentId!: string;
}

@Controller('workforce')
@UseGuards(BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard)
@RequiresFeature(ProductFeature.DOMESTIC_HELP)
export class WorkforceController {
  constructor(
    private readonly workforce: WorkforceService,
    private readonly realtime: NotificationRealtimeService,
  ) {}

  private event(request: AccessRequest, userId: string, gateId: string): AccessRealtimeEvent {
    return {
      type: 'ACCESS_STATUS_CHANGED',
      societyId: request.societyId,
      userId,
      gateId,
      requestId: request.id,
      subjectType: request.subjectType,
      subjectName: request.subjectName,
      status: request.status,
      createdAt: request.createdAt.toISOString(),
    };
  }

  @Get('mine')
  @RequiresPermissions(AppPermission.WORKFORCE_READ_OWN)
  mine(@CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated resident is required');
    return this.workforce.listMine(societyId, userId);
  }

  @Post()
  @RequiresPermissions(AppPermission.WORKFORCE_MANAGE_OWN)
  add(@Body() dto: AddWorkerDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated resident is required');
    return this.workforce.addWorker(societyId, userId, {
      householdId: dto.householdId,
      name: dto.name,
      phone: dto.phone,
      role: dto.role,
      schedule: dto.schedule,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
    });
  }

  @Patch('assignments/:assignmentId/deactivate')
  @RequiresPermissions(AppPermission.WORKFORCE_MANAGE_OWN)
  deactivate(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    if (!userId) throw new BadRequestException('Authenticated resident is required');
    return this.workforce.deactivateMine(societyId, userId, assignmentId);
  }

  @Get('review/pending')
  @RequiresPermissions(AppPermission.WORKFORCE_REVIEW)
  pending(@CurrentTenant() societyId: string) {
    return this.workforce.listPending(societyId);
  }

  @Get('review/all')
  @RequiresPermissions(AppPermission.WORKFORCE_REVIEW)
  reviewList(@CurrentTenant() societyId: string) {
    return this.workforce.listForReview(societyId);
  }

  @Patch('review/:assignmentId/approve')
  @RequiresPermissions(AppPermission.WORKFORCE_REVIEW)
  approve(@Param('assignmentId', ParseUUIDPipe) assignmentId: string, @CurrentTenant() societyId: string) {
    return this.workforce.review(societyId, assignmentId, 'APPROVED');
  }

  @Patch('review/:assignmentId/reject')
  @RequiresPermissions(AppPermission.WORKFORCE_REVIEW)
  reject(@Param('assignmentId', ParseUUIDPipe) assignmentId: string, @CurrentTenant() societyId: string) {
    return this.workforce.review(societyId, assignmentId, 'REJECTED');
  }

  @Get('gate/eligible')
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  gateEligible(
    @CurrentTenant() societyId: string,
    @CurrentUser() actorUserId?: string,
    @Query('query') query?: string,
  ) {
    if (!actorUserId) throw new BadRequestException('Authenticated guard is required');
    return this.workforce.listGateEligible(societyId, query);
  }

  @Post('gate/check-in')
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  async gateCheckIn(
    @Body() dto: GateWorkforceDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentTenant() societyId: string,
    @CurrentUser() actorUserId?: string,
  ) {
    if (!actorUserId) throw new BadRequestException('Authenticated guard is required');
    if (!idempotencyKey?.trim()) throw new BadRequestException('Idempotency-Key header is required');
    const result = await this.workforce.gateCheckIn(societyId, dto.gateId, dto.assignmentId, actorUserId, idempotencyKey);
    result.residentUserIds.forEach((userId) => this.realtime.publishResident(this.event(result.request, userId, dto.gateId)));
    return result.request;
  }

  @Post('gate/check-out')
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  async gateCheckOut(
    @Body() dto: GateWorkforceDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentTenant() societyId: string,
    @CurrentUser() actorUserId?: string,
  ) {
    if (!actorUserId) throw new BadRequestException('Authenticated guard is required');
    if (!idempotencyKey?.trim()) throw new BadRequestException('Idempotency-Key header is required');
    const result = await this.workforce.gateCheckOut(societyId, dto.gateId, dto.assignmentId, actorUserId, idempotencyKey);
    result.residentUserIds.forEach((userId) => this.realtime.publishResident(this.event(result.request, userId, dto.gateId)));
    return result.request;
  }
}
