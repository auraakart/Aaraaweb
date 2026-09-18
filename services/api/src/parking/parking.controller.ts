import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ParkingOperationsService } from './parking-operations.service';
import { ParkingPermitService } from './parking-permit.service';
import { ParkingService, ParkingSlotType } from './parking.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class CreateParkingSlotDto {
  @IsString() @MinLength(1) @MaxLength(60) code!: string;
  @IsOptional() @IsString() @MaxLength(120) label?: string;
  @IsOptional() @IsUUID() buildingId?: string;
  @IsOptional() @IsIn(['RESIDENT', 'VISITOR', 'TEMPORARY', 'ACCESSIBLE', 'STAFF']) slotType?: ParkingSlotType;
  @IsOptional() @IsBoolean() evReady?: boolean;
  @IsOptional() @IsString() @MaxLength(300) locationNote?: string;
}

class AllocateParkingDto {
  @IsUUID() slotId!: string;
  @IsUUID() householdId!: string;
  @IsUUID() vehicleId!: string;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

class ReleaseParkingDto { @IsOptional() @IsString() @MaxLength(300) note?: string; }
class CreateParkingPermitDto {
  @IsUUID() slotId!: string;
  @IsUUID() visitorId!: string;
  @IsUUID() visitorPassId!: string;
  @IsString() @MinLength(1) @MaxLength(30) plateNumber!: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
class CloseParkingPermitDto { @IsOptional() @IsString() @MaxLength(300) note?: string; }

class UpdateParkingPolicyDto {
  @IsInt() @Min(1) @Max(12) maxActiveResidentVehicles!: number;
  @IsBoolean() requireCredential!: boolean;
  @IsBoolean() allowTemporaryOverflow!: boolean;
}
class IssueParkingCredentialDto {
  @IsUUID() vehicleId!: string;
  @IsString() @MinLength(3) @MaxLength(80) credential!: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
class ParkingCredentialNoteDto { @IsOptional() @IsString() @MaxLength(300) note?: string; }
class ReportParkingViolationDto {
  @IsOptional() @IsUUID() slotId?: string;
  @IsOptional() @IsUUID() vehicleId?: string;
  @IsOptional() @IsUUID() permitId?: string;
  @IsString() @MinLength(1) @MaxLength(40) code!: string;
  @IsOptional() @IsIn(['INFO','WARNING','CRITICAL']) severity?: 'INFO'|'WARNING'|'CRITICAL';
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
class ResolveParkingViolationDto { @IsOptional() @IsString() @MaxLength(500) resolutionNote?: string; }

@Controller('parking/v2')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class ParkingController {
  constructor(
    private readonly parking: ParkingService,
    private readonly permits: ParkingPermitService,
    private readonly operations: ParkingOperationsService,
  ) {}

  @Get('slots')
  @RequiresPermissions(AppPermission.PARKING_READ)
  list(@CurrentTenant() societyId: string) { return this.parking.list(societyId); }

  @Post('slots')
  @RequiresPermissions(AppPermission.PARKING_MANAGE)
  createSlot(@Body() dto: CreateParkingSlotDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.parking.createSlot(societyId, this.requireUser(userId), dto);
  }

  @Post('allocations')
  @RequiresPermissions(AppPermission.PARKING_MANAGE)
  allocate(@Body() dto: AllocateParkingDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.parking.allocate(societyId, this.requireUser(userId), dto);
  }

  @Patch('allocations/:allocationId/release')
  @RequiresPermissions(AppPermission.PARKING_MANAGE)
  release(@Param('allocationId', ParseUUIDPipe) allocationId: string, @Body() dto: ReleaseParkingDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.parking.release(societyId, this.requireUser(userId), allocationId, dto.note);
  }

  @Get('eligible-visitors')
  @RequiresPermissions(AppPermission.PARKING_READ)
  eligibleVisitors(@CurrentTenant() societyId: string) { return this.permits.eligibleVisitors(societyId); }

  @Get('permits')
  @RequiresPermissions(AppPermission.PARKING_READ)
  listPermits(@CurrentTenant() societyId: string) { return this.permits.list(societyId); }

  @Post('permits')
  @RequiresPermissions(AppPermission.PARKING_MANAGE)
  createPermit(@Body() dto: CreateParkingPermitDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.permits.create(societyId, this.requireUser(userId), dto);
  }

  @Patch('permits/:permitId/cancel')
  @RequiresPermissions(AppPermission.PARKING_MANAGE)
  cancelPermit(@Param('permitId', ParseUUIDPipe) permitId: string, @Body() dto: CloseParkingPermitDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.permits.cancel(societyId, this.requireUser(userId), permitId, dto.note);
  }

  @Patch('permits/:permitId/complete')
  @RequiresPermissions(AppPermission.PARKING_MANAGE)
  completePermit(@Param('permitId', ParseUUIDPipe) permitId: string, @Body() dto: CloseParkingPermitDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.permits.complete(societyId, this.requireUser(userId), permitId, dto.note);
  }

  @Get('policy')
  @RequiresPermissions(AppPermission.PARKING_READ)
  policy(@CurrentTenant() societyId: string) { return this.operations.policy(societyId); }

  @Put('policy')
  @RequiresPermissions(AppPermission.PARKING_MANAGE)
  updatePolicy(@Body() dto: UpdateParkingPolicyDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.operations.updatePolicy(societyId, this.requireUser(userId), dto);
  }

  @Get('credentials')
  @RequiresPermissions(AppPermission.PARKING_READ)
  credentials(@CurrentTenant() societyId: string) { return this.operations.credentials(societyId); }

  @Post('credentials')
  @RequiresPermissions(AppPermission.PARKING_MANAGE)
  issueCredential(@Body() dto: IssueParkingCredentialDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.operations.issueCredential(societyId, this.requireUser(userId), dto);
  }

  @Patch('credentials/:credentialId/revoke')
  @RequiresPermissions(AppPermission.PARKING_MANAGE)
  revokeCredential(@Param('credentialId', ParseUUIDPipe) credentialId: string, @Body() dto: ParkingCredentialNoteDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.operations.revokeCredential(societyId, this.requireUser(userId), credentialId, dto.note);
  }

  @Get('violations')
  @RequiresPermissions(AppPermission.PARKING_READ)
  violations(@CurrentTenant() societyId: string) { return this.operations.violations(societyId); }

  @Post('violations')
  @RequiresPermissions(AppPermission.PARKING_MANAGE)
  reportViolation(@Body() dto: ReportParkingViolationDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.operations.reportViolation(societyId, this.requireUser(userId), dto);
  }

  @Patch('violations/:violationId/resolve')
  @RequiresPermissions(AppPermission.PARKING_MANAGE)
  resolveViolation(@Param('violationId', ParseUUIDPipe) violationId: string, @Body() dto: ResolveParkingViolationDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.operations.resolveViolation(societyId, this.requireUser(userId), violationId, dto.resolutionNote);
  }

  @Get('history')
  @RequiresPermissions(AppPermission.PARKING_READ)
  history(@CurrentTenant() societyId: string) { return this.parking.history(societyId); }

  private requireUser(userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
