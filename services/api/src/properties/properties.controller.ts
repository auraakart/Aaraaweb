import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { CreateBuildingDto } from './dto/create-building.dto';
import { CreateUnitDto } from './dto/create-unit.dto';

@Controller('societies/:societyId')
export class PropertiesController {
  constructor(private readonly service: PropertiesService) {}

  @Get('buildings')
  listBuildings(@Param('societyId') societyId: string) {
    return this.service.listBuildings(societyId);
  }

  @Post('buildings')
  createBuilding(@Param('societyId') societyId: string, @Body() dto: CreateBuildingDto) {
    return this.service.createBuilding(societyId, dto.name, dto.code);
  }

  @Get('buildings/:buildingId/units')
  listUnits(@Param('societyId') societyId: string, @Param('buildingId') buildingId: string) {
    return this.service.listUnits(societyId, buildingId);
  }

  @Post('buildings/:buildingId/units')
  createUnit(@Param('societyId') societyId: string, @Param('buildingId') buildingId: string, @Body() dto: CreateUnitDto) {
    return this.service.createUnit(societyId, buildingId, dto.number);
  }
}
