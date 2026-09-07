import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsPostalCode, IsString, Max, Min } from 'class-validator';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { ConsumerServiceLocationService } from './consumer-service-location.service';

class SocietyServiceAddressDto {
  @IsString() @IsNotEmpty() addressLine1!: string;
  @IsOptional() @IsString() addressLine2?: string;
  @IsString() @IsNotEmpty() locality!: string;
  @IsString() @IsNotEmpty() city!: string;
  @IsString() @IsNotEmpty() state!: string;
  @IsPostalCode('IN') postalCode!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude?: number;
}

class OfferingServiceAreaDto {
  @IsPostalCode('IN') postalCode!: string;
}

class SetOfferingServiceAreaActiveDto {
  @IsBoolean() active!: boolean;
}

@Controller('platform/services')
@UseGuards(BearerGuard, PermissionsGuard)
export class ConsumerServiceLocationPlatformController {
  constructor(private readonly locations: ConsumerServiceLocationService) {}

  @Post('societies/:societyId/service-address')
  @RequiresPermissions(AppPermission.PLATFORM_SERVICE_CATALOG_MANAGE)
  upsertSocietyServiceAddress(
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Body() dto: SocietyServiceAddressDto,
  ) {
    return this.locations.upsertSocietyServiceAddress(societyId, dto);
  }

  @Get('offerings/:offeringId/service-areas')
  @RequiresPermissions(AppPermission.PLATFORM_SERVICE_CATALOG_MANAGE)
  listOfferingServiceAreas(@Param('offeringId', ParseUUIDPipe) offeringId: string) {
    return this.locations.listOfferingServiceAreas(offeringId);
  }

  @Post('offerings/:offeringId/service-areas')
  @RequiresPermissions(AppPermission.PLATFORM_SERVICE_CATALOG_MANAGE)
  addOfferingServiceArea(
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Body() dto: OfferingServiceAreaDto,
  ) {
    return this.locations.addOfferingServiceArea(offeringId, dto.postalCode);
  }

  @Patch('offerings/:offeringId/service-areas/:areaId')
  @RequiresPermissions(AppPermission.PLATFORM_SERVICE_CATALOG_MANAGE)
  setOfferingServiceAreaActive(
    @Param('offeringId', ParseUUIDPipe) offeringId: string,
    @Param('areaId', ParseUUIDPipe) areaId: string,
    @Body() dto: SetOfferingServiceAreaActiveDto,
  ) {
    return this.locations.setOfferingServiceAreaActive(offeringId, areaId, dto.active);
  }
}
