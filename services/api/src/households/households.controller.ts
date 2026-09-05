import { Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { VehicleType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { BearerGuard, AuthenticatedRequest } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { HouseholdService } from './household.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class CreateHouseholdDto {
  @IsUUID() unitId!: string;
  @IsOptional() @IsString() displayName?: string;
}
class UpdatePreferencesDto { @IsObject() preferences!: Record<string, unknown>; }
class AddVehicleDto {
  @IsString() @IsNotEmpty() plateNumber!: string;
  @IsEnum(VehicleType) vehicleType!: VehicleType;
  @IsOptional() @IsString() make?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() color?: string;
}
class UpdateVehicleParkingDto {
  @IsOptional() @IsString() parkingSlot?: string;
}
class AddEmergencyContactDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() phone!: string;
  @IsOptional() @IsString() relation?: string;
  @IsOptional() @IsInt() @Min(1) priority?: number;
}
class AddFamilyMemberDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() phone!: string;
  @IsOptional() @IsBoolean() gateApprovalEnabled?: boolean;
  @IsOptional() @IsBoolean() gateNotificationEnabled?: boolean;
  @IsOptional() @IsBoolean() primaryGateContact?: boolean;
  @IsOptional() @IsInt() @Min(0) escalationOrder?: number;
}
class UpdateFamilyMemberDto {
  @IsOptional() @IsBoolean() gateApprovalEnabled?: boolean;
  @IsOptional() @IsBoolean() gateNotificationEnabled?: boolean;
  @IsOptional() @IsBoolean() primaryGateContact?: boolean;
  @IsOptional() @IsInt() @Min(0) escalationOrder?: number;
}

@Controller('households')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class HouseholdsController {
  constructor(private readonly households: HouseholdService) {}

  @Get('mine')
  @RequiresPermissions(AppPermission.HOUSEHOLD_READ_OWN)
  listMine(@CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    return this.households.listMine(societyId, userId);
  }

  @Post()
  @RequiresPermissions(AppPermission.HOUSEHOLD_MANAGE_OWN)
  create(@Body() dto: CreateHouseholdDto, @CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    return this.households.create(societyId, userId, dto.unitId, dto.displayName);
  }

  @Post(':householdId/family-members')
  @RequiresPermissions(AppPermission.HOUSEHOLD_MANAGE_OWN)
  addFamilyMember(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Body() dto: AddFamilyMemberDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string,
  ) {
    return this.households.addFamilyMember(societyId, userId, householdId, dto);
  }

  @Patch(':householdId/family-members/:occupancyId')
  @RequiresPermissions(AppPermission.HOUSEHOLD_MANAGE_OWN)
  updateFamilyMember(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('occupancyId', ParseUUIDPipe) occupancyId: string,
    @Body() dto: UpdateFamilyMemberDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string,
  ) {
    return this.households.updateFamilyMember(societyId, userId, householdId, occupancyId, dto);
  }

  @Patch(':householdId/family-members/:occupancyId/deactivate')
  @RequiresPermissions(AppPermission.HOUSEHOLD_MANAGE_OWN)
  deactivateFamilyMember(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('occupancyId', ParseUUIDPipe) occupancyId: string,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string,
  ) {
    return this.households.deactivateFamilyMember(societyId, userId, householdId, occupancyId);
  }

  @Patch(':householdId/access-preferences')
  @RequiresPermissions(AppPermission.HOUSEHOLD_MANAGE_OWN)
  updatePreferences(@Param('householdId', ParseUUIDPipe) householdId: string, @Body() dto: UpdatePreferencesDto, @CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    return this.households.updatePreferences(societyId, userId, householdId, dto.preferences);
  }

  @Post(':householdId/vehicles')
  @RequiresPermissions(AppPermission.HOUSEHOLD_MANAGE_OWN)
  addVehicle(@Param('householdId', ParseUUIDPipe) householdId: string, @Body() dto: AddVehicleDto, @CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    return this.households.addVehicle(societyId, userId, householdId, dto);
  }

  @Patch(':householdId/vehicles/:vehicleId/parking-slot')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
  updateVehicleParking(
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Body() dto: UpdateVehicleParkingDto,
    @CurrentTenant() societyId: string,
  ) {
    return this.households.updateVehicleParkingSlot(societyId, householdId, vehicleId, dto.parkingSlot);
  }

  @Patch(':householdId/vehicles/:vehicleId/deactivate')
  @RequiresPermissions(AppPermission.HOUSEHOLD_MANAGE_OWN)
  deactivateVehicle(@Param('householdId', ParseUUIDPipe) householdId: string, @Param('vehicleId', ParseUUIDPipe) vehicleId: string, @CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    return this.households.deactivateVehicle(societyId, userId, householdId, vehicleId);
  }

  @Post(':householdId/emergency-contacts')
  @RequiresPermissions(AppPermission.HOUSEHOLD_MANAGE_OWN)
  addEmergencyContact(@Param('householdId', ParseUUIDPipe) householdId: string, @Body() dto: AddEmergencyContactDto, @CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    return this.households.addEmergencyContact(societyId, userId, householdId, dto);
  }

  @Patch(':householdId/emergency-contacts/:contactId/deactivate')
  @RequiresPermissions(AppPermission.HOUSEHOLD_MANAGE_OWN)
  deactivateEmergencyContact(@Param('householdId', ParseUUIDPipe) householdId: string, @Param('contactId', ParseUUIDPipe) contactId: string, @CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    return this.households.deactivateEmergencyContact(societyId, userId, householdId, contactId);
  }
}
