import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsISO8601, IsOptional } from 'class-validator';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import {
  ProviderCommercialService,
  ProviderPlacementType,
  ProviderSubscriptionTier,
} from './provider-commercial.service';

class SetProviderCommercialDto {
  @IsIn(['BASIC', 'GROWTH', 'PREMIUM'])
  subscriptionTier!: ProviderSubscriptionTier;

  @IsOptional() @IsISO8601() subscriptionStartsAt?: string;
  @IsOptional() @IsISO8601() subscriptionEndsAt?: string;

  @IsIn(['NONE', 'FEATURED', 'SPONSORED'])
  placementType!: ProviderPlacementType;

  @IsOptional() @IsISO8601() placementStartsAt?: string;
  @IsOptional() @IsISO8601() placementEndsAt?: string;

  @IsOptional() @IsBoolean() active?: boolean;
}

@Controller('platform/services/providers/:providerId/commercial')
@UseGuards(BearerGuard, PermissionsGuard)
@RequiresPermissions(AppPermission.PLATFORM_SERVICE_CATALOG_MANAGE)
export class ProviderCommercialPlatformController {
  constructor(private readonly commercial: ProviderCommercialService) {}

  @Get()
  get(@Param('providerId', ParseUUIDPipe) providerId: string) {
    return this.commercial.get(providerId);
  }

  @Patch()
  set(
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Body() dto: SetProviderCommercialDto,
  ) {
    return this.commercial.set(providerId, dto);
  }
}
