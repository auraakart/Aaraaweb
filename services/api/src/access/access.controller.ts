import { BadRequestException, Body, Controller, ExecutionContext, Get, Headers, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { AccessSubjectType } from '@prisma/client';
import { IsDateString, IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { AccessService } from './access.service';

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
  constructor(private readonly access: AccessService) {}

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
    return this.access.inviteVisitor(
      societyId,
      userId,
      dto.unitId,
      dto.name,
      new Date(dto.validFrom),
      new Date(dto.validUntil),
      dto.phone,
      dto.purpose,
    );
  }

  @Post('gate/walk-ins')
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  createWalkIn(@Body() dto: CreateWalkInVisitorDto, @CurrentTenant() societyId: string, @CurrentUser() actorUserId: string) {
    if (!actorUserId) throw new BadRequestException('Authenticated guard is required');
    return this.access.createWalkInVisitor(societyId, actorUserId, dto.gateId, dto.unitId, dto.name, dto.phone, dto.purpose);
  }

  @Post('gate/request-status')
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  gateRequestStatus(@Body() dto: GateRequestDto, @CurrentTenant() societyId: string, @CurrentUser() actorUserId: string) {
    if (!actorUserId) throw new BadRequestException('Authenticated guard is required');
    return this.access.gateRequestStatus(societyId, dto.gateId, dto.requestId);
  }

  @Post('gate/check-in-request')
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  checkInRequest(@Body() dto: GateRequestDto, @Headers('idempotency-key') idempotencyKey: string | undefined, @CurrentTenant() societyId: string, @CurrentUser() actorUserId: string) {
    if (!actorUserId) throw new BadRequestException('Authenticated guard is required');
    if (!idempotencyKey?.trim()) throw new BadRequestException('Idempotency-Key header is required');
    return this.access.checkInRequest(societyId, dto.gateId, dto.requestId, actorUserId, idempotencyKey);
  }

  @Post('gate/check-out-request')
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  checkOutRequest(@Body() dto: GateRequestDto, @Headers('idempotency-key') idempotencyKey: string | undefined, @CurrentTenant() societyId: string, @CurrentUser() actorUserId: string) {
    if (!actorUserId) throw new BadRequestException('Authenticated guard is required');
    if (!idempotencyKey?.trim()) throw new BadRequestException('Idempotency-Key header is required');
    return this.access.checkOutRequest(societyId, dto.gateId, dto.requestId, actorUserId, idempotencyKey);
  }

  @Post(':requestId/approve')
  @RequiresPermissions(AppPermission.ACCESS_MANAGE_OWN)
  approve(@Param('requestId', new ParseUUIDPipe()) requestId: string, @Body() dto: ApproveAccessRequestDto, @CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    if (!userId) throw new BadRequestException('Authenticated resident is required');
    return this.access.approve(societyId, userId, requestId, new Date(dto.validFrom), new Date(dto.validUntil));
  }

  @Post(':requestId/deny')
  @RequiresPermissions(AppPermission.ACCESS_MANAGE_OWN)
  deny(@Param('requestId', new ParseUUIDPipe()) requestId: string, @CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    if (!userId) throw new BadRequestException('Authenticated resident is required');
    return this.access.deny(societyId, userId, requestId);
  }

  @Post(':requestId/cancel')
  @RequiresPermissions(AppPermission.ACCESS_MANAGE_OWN)
  cancel(@Param('requestId', new ParseUUIDPipe()) requestId: string, @CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    if (!userId) throw new BadRequestException('Authenticated resident is required');
    return this.access.cancel(societyId, userId, requestId);
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
