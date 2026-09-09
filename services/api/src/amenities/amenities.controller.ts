import {
  BadRequestException,
  Body,
  Controller,
  ExecutionContext,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  createParamDecorator,
} from '@nestjs/common';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { AmenitiesService } from './amenities.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class CreateAmenityBookingDto {
  @IsString() @Matches(/^[0-9a-f-]{36}$/i) unitId!: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
}

class CreateAmenityDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{2,40}$/) code!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @IsObject() schedule?: Record<string, unknown>;
  @IsOptional() @IsObject() bookingRules?: Record<string, unknown>;
  @IsOptional() @IsInt() @Min(0) @Max(10_000_000) feePaise?: number;
  @IsOptional() @IsBoolean() requiresApproval?: boolean;
  @IsOptional() @IsInt() @Min(15) @Max(1440) slotMinutes?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) maxConcurrentBookings?: number;
}

class ReviewAmenityBookingDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

@Controller('amenities')
@UseGuards(BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard)
@RequiresFeature(ProductFeature.AMENITIES)
export class AmenitiesController {
  constructor(private readonly amenities: AmenitiesService) {}

  @Get()
  @RequiresPermissions(AppPermission.AMENITY_READ)
  list(@CurrentTenant() societyId: string) {
    return this.amenities.listAvailable(societyId);
  }

  @Get('bookings/mine')
  @RequiresPermissions(AppPermission.AMENITY_BOOK_OWN)
  listMine(
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string | undefined,
    @Query('unitId', ParseUUIDPipe) unitId: string,
  ) {
    return this.amenities.listMine(societyId, this.requireUser(userId), unitId);
  }

  @Post(':amenityId/bookings')
  @RequiresPermissions(AppPermission.AMENITY_BOOK_OWN)
  createBooking(
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string | undefined,
    @Param('amenityId', ParseUUIDPipe) amenityId: string,
    @Body() dto: CreateAmenityBookingDto,
  ) {
    return this.amenities.createBooking(societyId, this.requireUser(userId), amenityId, dto);
  }

  @Patch('bookings/:bookingId/cancel')
  @RequiresPermissions(AppPermission.AMENITY_BOOK_OWN)
  cancelMine(
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string | undefined,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ) {
    return this.amenities.cancelMine(societyId, this.requireUser(userId), bookingId);
  }

  @Get('manage')
  @RequiresPermissions(AppPermission.AMENITY_MANAGE)
  listManage(@CurrentTenant() societyId: string) {
    return this.amenities.listManage(societyId);
  }

  @Post('manage')
  @RequiresPermissions(AppPermission.AMENITY_MANAGE)
  createAmenity(@CurrentTenant() societyId: string, @Body() dto: CreateAmenityDto) {
    return this.amenities.createAmenity(societyId, dto);
  }

  @Get('manage/bookings')
  @RequiresPermissions(AppPermission.AMENITY_MANAGE)
  listBookingsManage(@CurrentTenant() societyId: string, @Query('status') status?: string) {
    const normalized = status?.trim().toUpperCase();
    if (normalized && !['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED'].includes(normalized)) {
      throw new BadRequestException('Invalid amenity booking status');
    }
    return this.amenities.listBookingsManage(societyId, normalized);
  }

  @Patch('manage/bookings/:bookingId/approve')
  @RequiresPermissions(AppPermission.AMENITY_MANAGE)
  approve(
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string | undefined,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() dto: ReviewAmenityBookingDto,
  ) {
    return this.amenities.approve(societyId, this.requireUser(userId), bookingId, dto.note);
  }

  @Patch('manage/bookings/:bookingId/reject')
  @RequiresPermissions(AppPermission.AMENITY_MANAGE)
  reject(
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string | undefined,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body() dto: ReviewAmenityBookingDto,
  ) {
    return this.amenities.reject(societyId, this.requireUser(userId), bookingId, dto.note);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
