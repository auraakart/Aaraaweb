import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsObject } from 'class-validator';
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { BearerGuard } from '../auth/bearer.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { MigrationEntityType, MigrationPreviewService } from './migration-preview.service';

const migrationEntityTypes: MigrationEntityType[] = [
  'BUILDING',
  'UNIT',
  'RESIDENT',
  'VEHICLE',
  'PARKING',
  'WORKFORCE',
  'VENDOR',
  'OPENING_BALANCE',
];

class MigrationPreviewDto {
  @IsIn(migrationEntityTypes)
  entityType!: MigrationEntityType;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10000)
  @IsObject({ each: true })
  rows!: Record<string, unknown>[];
}

@Controller('migration')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class MigrationController {
  constructor(private readonly previewService: MigrationPreviewService) {}

  @Post('preview')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
  preview(@Body() dto: MigrationPreviewDto, @CurrentTenant() societyId: string) {
    // TenantGuard resolves and validates society context before any migration data is processed.
    if (!societyId) throw new Error('Society context is required');
    return this.previewService.preview(dto.entityType, dto.rows);
  }
}
