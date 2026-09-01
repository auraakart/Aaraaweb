import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, Query, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsDateString, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { FeatureGuard } from '../entitlements/feature.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { ServicesMarketplaceService } from './services-marketplace.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);

class CreateCategoryDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() slug!: string;
  @IsOptional() @IsInt() sortOrder?: number;
}

class CreateProviderDto {
  @IsString() @IsNotEmpty() businessName!: string;
  @IsOptional() @IsString() contactName?: string;
  @IsString() @IsNotEmpty() phone!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() description?: string;
}

class ApproveProviderDto {
  @IsOptional() @IsInt() @Min(0) @Max(10000) commissionBps?: number;
}

class CreateOfferingDto {
  @IsUUID() providerId!: string;
  @IsUUID() categoryId!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsInt() @Min(0) pricePaise!: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(1) durationMinutes?: number;
}

class CreateBookingDto {
  @IsUUID() unitId!: string;
  @IsUUID() offeringId!: string;
  @IsDateString() scheduledFrom!: string;
  @IsDateString() scheduledUntil!: string;
  @IsOptional() @IsString() notes?: string;
}

class RateBookingDto {
  @IsInt() @Min(1) @Max(5) score!: number;
  @IsOptional() @IsString() comment?: string;
}

@Controller('services-marketplace')
@UseGuards(BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard)
@RequiresFeature(ProductFeature.HOUSEHOLD_SERVICES)
export class ServicesMarketplaceController {
  constructor(private readonly marketplace: ServicesMarketplaceService) {}

  @Get('categories')
  @RequiresPermissions(AppPermission.SERVICES_MARKETPLACE_USE)
  categories() {
    return this.marketplace.listCategories();
  }

  @Get('offerings')
  @RequiresPermissions(AppPermission.SERVICES_MARKETPLACE_USE)
  offerings(@CurrentTenant() societyId: string, @Query('categoryId') categoryId?: string) {
    return this.marketplace.listOfferings(societyId, categoryId);
  }

  @Post('bookings')
  @RequiresPermissions(AppPermission.SERVICES_MARKETPLACE_USE)
  book(@Body() dto: CreateBookingDto, @CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    if (!userId) throw new BadRequestException('Authenticated resident is required');
    return this.marketplace.book(societyId, userId, dto.unitId, dto.offeringId, new Date(dto.scheduledFrom), new Date(dto.scheduledUntil), dto.notes);
  }

  @Get('bookings/mine')
  @RequiresPermissions(AppPermission.SERVICES_MARKETPLACE_USE)
  mine(@CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    if (!userId) throw new BadRequestException('Authenticated resident is required');
    return this.marketplace.listMine(societyId, userId);
  }

  @Post('bookings/:bookingId/cancel')
  @RequiresPermissions(AppPermission.SERVICES_MARKETPLACE_USE)
  cancel(@Param('bookingId', ParseUUIDPipe) bookingId: string, @CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    if (!userId) throw new BadRequestException('Authenticated resident is required');
    return this.marketplace.cancelMine(societyId, userId, bookingId);
  }

  @Post('bookings/:bookingId/rating')
  @RequiresPermissions(AppPermission.SERVICES_MARKETPLACE_USE)
  rate(@Param('bookingId', ParseUUIDPipe) bookingId: string, @Body() dto: RateBookingDto, @CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    if (!userId) throw new BadRequestException('Authenticated resident is required');
    return this.marketplace.rate(societyId, userId, bookingId, dto.score, dto.comment);
  }

  @Post('admin/categories')
  @RequiresPermissions(AppPermission.SERVICES_PROVIDER_MANAGE)
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.marketplace.createCategory(dto.name, dto.slug, dto.sortOrder);
  }

  @Post('admin/providers')
  @RequiresPermissions(AppPermission.SERVICES_PROVIDER_MANAGE)
  createProvider(@Body() dto: CreateProviderDto) {
    return this.marketplace.createProvider(dto);
  }

  @Post('admin/providers/:providerId/approve')
  @RequiresPermissions(AppPermission.SERVICES_PROVIDER_MANAGE)
  approveProvider(@Param('providerId', ParseUUIDPipe) providerId: string, @Body() dto: ApproveProviderDto, @CurrentTenant() societyId: string) {
    return this.marketplace.approveProviderForSociety(societyId, providerId, dto.commissionBps);
  }

  @Post('admin/offerings')
  @RequiresPermissions(AppPermission.SERVICES_PROVIDER_MANAGE)
  createOffering(@Body() dto: CreateOfferingDto) {
    return this.marketplace.createOffering(dto.providerId, dto.categoryId, dto.name, dto.pricePaise, dto.description, dto.durationMinutes);
  }

  @Post('admin/bookings/:bookingId/confirm')
  @RequiresPermissions(AppPermission.SERVICES_PROVIDER_MANAGE)
  confirm(@Param('bookingId', ParseUUIDPipe) bookingId: string, @CurrentTenant() societyId: string) {
    return this.marketplace.confirm(societyId, bookingId);
  }

  @Post('admin/bookings/:bookingId/complete')
  @RequiresPermissions(AppPermission.SERVICES_PROVIDER_MANAGE)
  complete(@Param('bookingId', ParseUUIDPipe) bookingId: string, @CurrentTenant() societyId: string) {
    return this.marketplace.complete(societyId, bookingId);
  }
}
