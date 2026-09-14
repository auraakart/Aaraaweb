import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { UtilitiesService, UtilityMeterType, UtilityReadingKind, UtilityReadingSource } from './utilities.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class CreateUtilityMeterDto {
  @IsString() @MinLength(1) @MaxLength(60) code!: string;
  @IsOptional() @IsString() @MaxLength(120) label?: string;
  @IsOptional() @IsUUID() buildingId?: string;
  @IsOptional() @IsUUID() unitId?: string;
  @IsIn(['ELECTRICITY', 'WATER', 'DG', 'GAS', 'OTHER']) meterType!: UtilityMeterType;
  @IsOptional() @IsString() @MaxLength(120) externalRef?: string;
}

class CreateUtilityReadingDto {
  @IsUUID() meterId!: string;
  @IsDateString() readingAt!: string;
  @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) value!: number;
  @IsOptional() @IsIn(['ACTUAL', 'RESET']) readingKind?: UtilityReadingKind;
  @IsOptional() @IsIn(['MANUAL', 'IMPORT', 'INTEGRATION']) source?: UtilityReadingSource;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

class DeactivateUtilityMeterDto {
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

@Controller('utilities/v2')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class UtilitiesController {
  constructor(private readonly utilities: UtilitiesService) {}

  @Get('meters')
  @RequiresPermissions(AppPermission.UTILITY_READ)
  listMeters(@CurrentTenant() societyId: string) {
    return this.utilities.listMeters(societyId);
  }

  @Post('meters')
  @RequiresPermissions(AppPermission.UTILITY_MANAGE)
  createMeter(@Body() dto: CreateUtilityMeterDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.utilities.createMeter(societyId, this.requireUser(userId), dto);
  }

  @Patch('meters/:meterId/deactivate')
  @RequiresPermissions(AppPermission.UTILITY_MANAGE)
  deactivateMeter(
    @Param('meterId', ParseUUIDPipe) meterId: string,
    @Body() dto: DeactivateUtilityMeterDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.utilities.deactivateMeter(societyId, this.requireUser(userId), meterId, dto.note);
  }

  @Get('meters/:meterId/readings')
  @RequiresPermissions(AppPermission.UTILITY_READ)
  listReadings(@Param('meterId', ParseUUIDPipe) meterId: string, @CurrentTenant() societyId: string) {
    return this.utilities.listReadings(societyId, meterId);
  }

  @Post('readings')
  @RequiresPermissions(AppPermission.UTILITY_MANAGE)
  createReading(@Body() dto: CreateUtilityReadingDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.utilities.createReading(societyId, this.requireUser(userId), dto);
  }

  @Get('history')
  @RequiresPermissions(AppPermission.UTILITY_READ)
  history(@CurrentTenant() societyId: string) {
    return this.utilities.history(societyId);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
