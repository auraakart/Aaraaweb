import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { BearerGuard } from '../auth/bearer.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { PropertiesService } from './properties.service';
import { CreateBuildingDto } from './dto/create-building.dto';
import { CreateUnitDto } from './dto/create-unit.dto';

@Controller('societies/:societyId')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class PropertiesController {
  constructor(private readonly service: PropertiesService) {}

  private assertTenantPath(societyId: string, tenantSocietyId: string) {
    if (societyId !== tenantSocietyId) throw new ForbiddenException('Society path does not match authenticated tenant');
  }

  @Get('buildings')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_READ)
  listBuildings(
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @CurrentTenant() tenantSocietyId: string,
  ) {
    this.assertTenantPath(societyId, tenantSocietyId);
    return this.service.listBuildings(societyId);
  }

  @Post('buildings')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
  createBuilding(
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @CurrentTenant() tenantSocietyId: string,
    @Body() dto: CreateBuildingDto,
  ) {
    this.assertTenantPath(societyId, tenantSocietyId);
    return this.service.createBuilding(societyId, dto.name, dto.code);
  }

  @Get('buildings/:buildingId/units')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_READ)
  listUnits(
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Param('buildingId', ParseUUIDPipe) buildingId: string,
    @CurrentTenant() tenantSocietyId: string,
  ) {
    this.assertTenantPath(societyId, tenantSocietyId);
    return this.service.listUnits(societyId, buildingId);
  }

  @Post('buildings/:buildingId/units')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
  createUnit(
    @Param('societyId', ParseUUIDPipe) societyId: string,
    @Param('buildingId', ParseUUIDPipe) buildingId: string,
    @CurrentTenant() tenantSocietyId: string,
    @Body() dto: CreateUnitDto,
  ) {
    this.assertTenantPath(societyId, tenantSocietyId);
    return this.service.createUnit(societyId, buildingId, dto.number);
  }
}
