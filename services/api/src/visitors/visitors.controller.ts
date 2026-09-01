import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { BearerGuard, AuthenticatedRequest } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { GateAccessGuard } from '../gates/gate-access.guard';
import { VisitorService } from './visitor.service';
import { VisitorVerificationService } from './visitor-verification.service';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);

class CreateVisitorRequestDto { @IsUUID() unitId!: string; @IsString() @IsNotEmpty() name!: string; @IsOptional() @IsString() phone?: string; @IsOptional() @IsString() purpose?: string; }
class CreatePassDto { @IsUUID() unitId!: string; @IsString() @IsNotEmpty() name!: string; @IsString() @IsNotEmpty() phone!: string; @IsDateString() validFrom!: string; @IsDateString() validUntil!: string; }
class ApproveVisitorDto { @IsDateString() validFrom!: string; @IsDateString() validUntil!: string; }
class GateCredentialDto { @IsUUID() gateId!: string; @IsString() @IsNotEmpty() credential!: string; }

@Controller('visitors')
@UseGuards(BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard)
@RequiresFeature(ProductFeature.VISITOR_MANAGEMENT)
export class VisitorsController {
  constructor(private readonly visitors: VisitorService, private readonly verification: VisitorVerificationService) {}

  @Get('mine')
  @RequiresPermissions(AppPermission.VISITOR_READ_OWN)
  listMine(@CurrentTenant() societyId: string, @CurrentUser() hostUserId: string) {
    if (!hostUserId) throw new BadRequestException('Authenticated host is required');
    return this.visitors.listForHost(societyId, hostUserId);
  }

  @Post('requests')
  @RequiresPermissions(AppPermission.VISITOR_MANAGE_OWN)
  createRequest(@Body() dto: CreateVisitorRequestDto, @CurrentTenant() societyId: string, @CurrentUser() hostUserId: string) {
    if (!hostUserId) throw new BadRequestException('Authenticated host is required');
    return this.visitors.createRequest(societyId, hostUserId, dto.unitId, dto.name, dto.phone, dto.purpose);
  }

  @Post(':visitorId/approve')
  @RequiresPermissions(AppPermission.VISITOR_MANAGE_OWN)
  approve(@Param('visitorId', new ParseUUIDPipe()) visitorId: string, @Body() dto: ApproveVisitorDto, @CurrentTenant() societyId: string, @CurrentUser() hostUserId: string) {
    if (!hostUserId) throw new BadRequestException('Authenticated host is required');
    return this.visitors.approve(societyId, hostUserId, visitorId, new Date(dto.validFrom), new Date(dto.validUntil));
  }

  @Post(':visitorId/deny')
  @RequiresPermissions(AppPermission.VISITOR_MANAGE_OWN)
  deny(@Param('visitorId', new ParseUUIDPipe()) visitorId: string, @CurrentTenant() societyId: string, @CurrentUser() hostUserId: string) {
    if (!hostUserId) throw new BadRequestException('Authenticated host is required');
    return this.visitors.deny(societyId, hostUserId, visitorId);
  }

  @Post(':visitorId/cancel')
  @RequiresPermissions(AppPermission.VISITOR_MANAGE_OWN)
  cancel(@Param('visitorId', new ParseUUIDPipe()) visitorId: string, @CurrentTenant() societyId: string, @CurrentUser() hostUserId: string) {
    if (!hostUserId) throw new BadRequestException('Authenticated host is required');
    return this.visitors.cancel(societyId, hostUserId, visitorId);
  }

  @Post('passes')
  @RequiresPermissions(AppPermission.VISITOR_MANAGE_OWN)
  createPass(@Body() dto: CreatePassDto, @CurrentTenant() societyId: string, @CurrentUser() hostUserId: string) {
    if (!hostUserId) throw new BadRequestException('Authenticated host is required');
    return this.visitors.createPass(societyId, hostUserId, dto.unitId, dto.name, dto.phone, new Date(dto.validFrom), new Date(dto.validUntil));
  }

  @Post('verify')
  @UseGuards(GateAccessGuard)
  @RequiresPermissions(AppPermission.GATE_VISITOR_VERIFY)
  verify(@Body() dto: GateCredentialDto, @CurrentTenant() societyId: string, @CurrentUser() actorUserId: string) { return this.verification.verify(societyId, dto.gateId, dto.credential, actorUserId); }

  @Post('check-in')
  @UseGuards(GateAccessGuard)
  @RequiresPermissions(AppPermission.GATE_VISITOR_CHECK_IN_OUT)
  checkIn(@Body() dto: GateCredentialDto, @CurrentTenant() societyId: string, @CurrentUser() actorUserId: string) { return this.verification.checkIn(societyId, dto.gateId, dto.credential, actorUserId); }

  @Post('check-out')
  @UseGuards(GateAccessGuard)
  @RequiresPermissions(AppPermission.GATE_VISITOR_CHECK_IN_OUT)
  checkOut(@Body() dto: GateCredentialDto, @CurrentTenant() societyId: string, @CurrentUser() actorUserId: string) { return this.verification.checkOut(societyId, dto.gateId, dto.credential, actorUserId); }
}
