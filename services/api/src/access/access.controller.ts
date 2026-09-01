import { BadRequestException, Body, Controller, ExecutionContext, Get, Headers, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { AccessRequest, AccessSubjectType } from '@prisma/client';
import { IsDateString, IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { AccessRealtimeEvent, NotificationRealtimeService } from '../notifications/notification-realtime.service';
import { AccessService } from './access.service';
import { GateArrivalService } from './gate-arrival.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class CreateAccessRequestDto {
  @IsUUID() unitId!: string;
  @IsEnum(AccessSubjectType) subjectType!: AccessSubjectType;
  @IsString() @IsNotEmpty() subjectName!: string;
  @IsOptional() @IsString() subjectPhone?: string;
  @IsOptional() @IsString() purpose?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

class CreateVisitorInviteDto {
  @IsUUID() unitId!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() purpose?: string;
  @IsDateString() validFrom!: string;
  @IsDateString() validUntil!: string;
}

class CreateWalkInVisitorDto {
  @IsUUID() gateId!: string;
  @IsUUID() unitId!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() purpose?: string;
}

class CreateGateArrivalDto {
  @IsUUID() gateId!: string;
  @IsUUID() unitId!: string;
  @IsEnum(AccessSubjectType) subjectType!: AccessSubjectType;
  @IsString() @IsNotEmpty() name!: string;
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() vehicleNumber?: string;
  @IsOptional() @IsString() note?: string;
}

class GateRequestDto {
  @IsUUID() gateId!: string;
  @IsUUID() requestId!: string;
}

class ApproveAccessRequestDto {
  @IsDateString() validFrom!: string;
  @IsDateString() validUntil!: string;
}

class GateAccessDto {
  @IsUUID() gateId!: string;
  @IsString() @IsNotEmpty() credential!: string;
}

@Controller('access-requests')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class AccessController {
  constructor(
    private readonly access: AccessService,
    private readonly gateArrivals: GateArrivalService,
    private readonly realtime: NotificationRealtimeService,
  ) {}

  private gateId(request: AccessRequest): string | undefined {
    if (!request.metadata || typeof request.metadata !== 'object' || Array.isArray(request.metadata)) return undefined;
    const value = (request.metadata as Record<string, unknown>).gateId;
    return typeof value === 'string' ? value : undefined;
  }

  private event(request: AccessRequest, type: AccessRealtimeEvent['type'], gateId?: string): AccessRealtimeEvent {
    return {
      type,
      societyId: request.societyId,
      userId: request.requestedById,
      gateId: gateId ?? this.gateId(request),
      requestId: request.id,
      subjectType: request.subjectType,
      subjectName: request.subjectName,
      status: request.status,
      createdAt: request.createdAt.toISOString(),
    };
  }

  @Get('mine')
  @RequiresPermissions(AppPermission.ACCESS_READ_OWN)
  listMine(@CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    if (!userId) throw new BadRequestException('Authenticated resident is required');
    return this.access.listMine(societyId, userId);
  }

  @Get('gate/units')
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  listGateUnits(@CurrentTenant() societyId: string, @CurrentUser() actorUserId: string) {
    if (!actorUserId) throw new BadRequestException('Authenticated guard is required');
    return this.access.listGateUnits(societyId);
  }

  @Post()
  @RequiresPermissions(AppPermission.ACCESS_MANAGE_OWN)
  create(@Body() dto: CreateAccessRequestDto, @CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    if (!userId) throw new BadRequestException('Authenticated resident is required');
    return this.access.create(societyId, userId, dto.unitId, dto.subjectType, dto.subjectName, dto.subjectPhone, dto.purpose, dto.metadata);
  }

  @Post('visitor-invites')
  @RequiresPermissions(AppPermission.ACCESS_MANAGE_OWN)
  inviteVisitor(@Body() dto: CreateVisitorInviteDto, @CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    if (!userId) throw new BadRequestException('Authenticated resident is required');
    return this.access.inviteVisitor(societyId, userId, dto.unitId, dto.name, new Date(dto.validFrom), new Date(dto.validUntil), dto.phone, dto.purpose);
  }

  @Post('gate/walk-ins')
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  async createWalkIn(@Body() dto: CreateWalkInVisitorDto, @CurrentTenant() societyId: string, @CurrentUser() actorUserId: string) {
    if (!actorUserId) throw new BadRequestException('Authenticated guard is required');
    const request = await this.access.createWalkInVisitor(societyId, actorUserId, dto.gateId, dto.unitId, dto.name, dto.phone, dto.purpose);
    this.realtime.publishResident(this.event(request, 'ACCESS_APPROVAL_REQUESTED', dto.gateId));
    return request;
  }

  @Post('gate/arrivals')
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  async createGateArrival(@Body() dto: CreateGateArrivalDto, @CurrentTenant() societyId: string, @CurrentUser() actorUserId: string) {
    if (!actorUserId) throw new BadRequestException('Authenticated guard is required');
    const request = await this.gateArrivals.create(societyId, actorUserId, dto.gateId, dto.unitId, dto.subjectType, dto.name, dto.provider, dto.phone, dto.vehicleNumber, dto.note);
    this.realtime.publishResident(this.event(request, 'ACCESS_APPROVAL_REQUESTED', dto.gateId));
    return request;
  }

  @Post('gate/request-status')
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  gateRequestStatus(@Body() dto: GateRequestDto, @CurrentTenant() societyId: string, @CurrentUser() actorUserId: string) {
    if (!actorUserId) throw new BadRequestException('Authenticated guard is required');
    return this.access.gateRequestStatus(societyId, dto.gateId, dto.requestId);
  }

  @Post('gate/check-in-request')
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  async checkInRequest(@Body() dto: GateRequestDto, @Headers('idempotency-key') idempotencyKey: string | undefined, @CurrentTenant() societyId: string, @CurrentUser() actorUserId: string) {
    if (!actorUserId) throw new BadRequestException('Authenticated guard is required');
    if (!idempotencyKey?.trim()) throw new BadRequestException('Idempotency-Key header is required');
    const request = await this.access.checkInRequest(societyId, dto.gateId, dto.requestId, actorUserId, idempotencyKey);
    this.realtime.publishResident(this.event(request, 'ACCESS_STATUS_CHANGED', dto.gateId));
    return request;
  }

  @Post('gate/check-out-request')
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  async checkOutRequest(@Body() dto: GateRequestDto, @Headers('idempotency-key') idempotencyKey: string | undefined, @CurrentTenant() societyId: string, @CurrentUser() actorUserId: string) {
    if (!actorUserId) throw new BadRequestException('Authenticated guard is required');
    if (!idempotencyKey?.trim()) throw new BadRequestException('Idempotency-Key header is required');
    const request = await this.access.checkOutRequest(societyId, dto.gateId, dto.requestId, actorUserId, idempotencyKey);
    this.realtime.publishResident(this.event(request, 'ACCESS_STATUS_CHANGED', dto.gateId));
    return request;
  }

  @Post(':requestId/approve')
  @RequiresPermissions(AppPermission.ACCESS_MANAGE_OWN)
  async approve(@Param('requestId', new ParseUUIDPipe()) requestId: string, @Body() dto: ApproveAccessRequestDto, @CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    if (!userId) throw new BadRequestException('Authenticated resident is required');
    const result = await this.access.approve(societyId, userId, requestId, new Date(dto.validFrom), new Date(dto.validUntil));
    this.realtime.publishGateUpdate(this.event(result.request, 'ACCESS_APPROVAL_DECIDED'));
    return result;
  }

  @Post(':requestId/deny')
  @RequiresPermissions(AppPermission.ACCESS_MANAGE_OWN)
  async deny(@Param('requestId', new ParseUUIDPipe()) requestId: string, @CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    if (!userId) throw new BadRequestException('Authenticated resident is required');
    const request = await this.access.deny(societyId, userId, requestId);
    this.realtime.publishGateUpdate(this.event(request, 'ACCESS_APPROVAL_DECIDED'));
    return request;
  }

  @Post(':requestId/cancel')
  @RequiresPermissions(AppPermission.ACCESS_MANAGE_OWN)
  async cancel(@Param('requestId', new ParseUUIDPipe()) requestId: string, @CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    if (!userId) throw new BadRequestException('Authenticated resident is required');
    const request = await this.access.cancel(societyId, userId, requestId);
    this.realtime.publishGateUpdate(this.event(request, 'ACCESS_APPROVAL_DECIDED'));
    return request;
  }

  @Post('gate/verify')
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  verify(@Body() dto: GateAccessDto, @CurrentTenant() societyId: string, @CurrentUser() actorUserId: string) {
    if (!actorUserId) throw new BadRequestException('Authenticated guard is required');
    return this.access.verify(societyId, dto.gateId, dto.credential, actorUserId);
  }

  @Post('gate/check-in')
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  checkIn(@Body() dto: GateAccessDto, @Headers('idempotency-key') idempotencyKey: string | undefined, @CurrentTenant() societyId: string, @CurrentUser() actorUserId: string) {
    if (!actorUserId) throw new BadRequestException('Authenticated guard is required');
    if (!idempotencyKey?.trim()) throw new BadRequestException('Idempotency-Key header is required');
    return this.access.checkIn(societyId, dto.gateId, dto.credential, actorUserId, idempotencyKey);
  }

  @Post('gate/check-out')
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  checkOut(@Body() dto: GateAccessDto, @Headers('idempotency-key') idempotencyKey: string | undefined, @CurrentTenant() societyId: string, @CurrentUser() actorUserId: string) {
    if (!actorUserId) throw new BadRequestException('Authenticated guard is required');
    if (!idempotencyKey?.trim()) throw new BadRequestException('Idempotency-Key header is required');
    return this.access.checkOut(societyId, dto.gateId, dto.credential, actorUserId, idempotencyKey);
  }
}
