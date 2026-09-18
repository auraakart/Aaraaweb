import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  BadRequestException,
  Body,
  Controller,
  ExecutionContext,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  createParamDecorator,
} from '@nestjs/common';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { MigrationBatchService } from './migration-batch.service';
import { MigrationEntityType, MigrationPreviewService } from './migration-preview.service';
import { MigrationCommitCoordinator } from './migration-commit-coordinator.service';

const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  context.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

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

class MigrationInputDto {
  @IsIn(migrationEntityTypes)
  entityType!: MigrationEntityType;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10000)
  @IsObject({ each: true })
  rows!: Record<string, unknown>[];

  @IsOptional()
  @IsString()
  @MaxLength(160)
  sourceLabel?: string;
}

@Controller('migration')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class MigrationController {
  constructor(
    private readonly previewService: MigrationPreviewService,
    private readonly batchService: MigrationBatchService,
    private readonly commitCoordinator: MigrationCommitCoordinator,
  ) {}

  @Post('preview')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
  preview(@Body() dto: MigrationInputDto, @CurrentTenant() societyId: string) {
    if (!societyId) throw new BadRequestException('Society context is required');
    return this.previewService.preview(dto.entityType, dto.rows);
  }

  @Post('batches')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
  createBatch(
    @Body() dto: MigrationInputDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() actorUserId?: string,
  ) {
    if (!actorUserId) throw new BadRequestException('Authenticated user is required');
    return this.batchService.createPreviewBatch(
      societyId,
      actorUserId,
      dto.entityType,
      dto.rows,
      dto.sourceLabel,
    );
  }

  @Get('batches')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
  listBatches(@CurrentTenant() societyId: string) {
    return this.batchService.listBatches(societyId);
  }

  @Get('batches/:id')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
  getBatch(
    @CurrentTenant() societyId: string,
    @Param('id', new ParseUUIDPipe()) batchId: string,
  ) {
    return this.batchService.getBatch(societyId, batchId);
  }

  @Get('batches/:id/evidence.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
  exportBatchEvidence(
    @CurrentTenant() societyId: string,
    @Param('id', new ParseUUIDPipe()) batchId: string,
  ) {
    return this.batchService.exportEvidenceCsv(societyId, batchId);
  }

  @Post('batches/:id/commit')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
  commitBatch(
    @CurrentTenant() societyId: string,
    @Param('id', new ParseUUIDPipe()) batchId: string,
    @CurrentUser() actorUserId?: string,
  ) {
    if (!actorUserId) throw new BadRequestException('Authenticated user is required');
    return this.commitCoordinator.commit(societyId, actorUserId, batchId);
  }

  @Post('batches/:id/rollback')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
  rollbackBatch(
    @CurrentTenant() societyId: string,
    @Param('id', new ParseUUIDPipe()) batchId: string,
    @CurrentUser() actorUserId?: string,
  ) {
    if (!actorUserId) throw new BadRequestException('Authenticated user is required');
    return this.commitCoordinator.rollback(societyId, actorUserId, batchId);
  }
}
