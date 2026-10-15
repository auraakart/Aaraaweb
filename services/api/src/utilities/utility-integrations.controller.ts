import {
  BadRequestException,
  Body,
  Controller,
  ExecutionContext,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  createParamDecorator,
} from '@nestjs/common';
import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { UtilityIntegrationsService } from './utility-integrations.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class CreateUtilityIntegrationDto {
  @IsString() @MinLength(1) @MaxLength(60) code!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
}

class CreateUtilityMeterMappingDto {
  @IsString() @MinLength(1) @MaxLength(160) externalMeterId!: string;
  @IsUUID() meterId!: string;
}

class ReplaceUtilityMeterMappingDto {
  @IsUUID() meterId!: string;
}

class UtilityIngestionResolutionDto {
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

class IngestUtilityReadingDto {
  @IsString() @MinLength(1) @MaxLength(120) idempotencyKey!: string;
  @IsString() @MinLength(1) @MaxLength(160) externalMeterId!: string;
  @IsString() readingAt!: string;
  @IsNumber({ maxDecimalPlaces: 6 }) value!: number;
  @IsOptional() @IsString() readingKind?: 'ACTUAL' | 'RESET';
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

@Controller('utilities/v2/integrations')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class UtilityIntegrationManagementController {
  constructor(private readonly integrations: UtilityIntegrationsService) {}

  @Get()
  @RequiresPermissions(AppPermission.FACILITIES_READ)
  list(@CurrentTenant() societyId: string) {
    return this.integrations.list(societyId);
  }

  @Post()
  @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  create(
    @Body() dto: CreateUtilityIntegrationDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.integrations.create(societyId, this.requireUser(userId), dto);
  }

  @Post(':integrationId/revoke')
  @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  revoke(
    @Param('integrationId', ParseUUIDPipe) integrationId: string,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.integrations.revoke(societyId, this.requireUser(userId), integrationId);
  }

  @Post(':integrationId/rotate-key')
  @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  rotateKey(
    @Param('integrationId', ParseUUIDPipe) integrationId: string,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.integrations.rotateKey(societyId, this.requireUser(userId), integrationId);
  }

  @Post(':integrationId/mappings')
  @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  createMapping(
    @Param('integrationId', ParseUUIDPipe) integrationId: string,
    @Body() dto: CreateUtilityMeterMappingDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.integrations.createMapping(societyId, this.requireUser(userId), integrationId, dto);
  }

  @Get('mappings')
  @RequiresPermissions(AppPermission.FACILITIES_READ)
  mappings(@CurrentTenant() societyId: string) {
    return this.integrations.listMappings(societyId);
  }

  @Post(':integrationId/mappings/:mappingId/retire')
  @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  retireMapping(
    @Param('integrationId', ParseUUIDPipe) integrationId: string,
    @Param('mappingId', ParseUUIDPipe) mappingId: string,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.integrations.retireMapping(societyId, this.requireUser(userId), integrationId, mappingId);
  }

  @Post(':integrationId/mappings/:mappingId/replace')
  @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  replaceMapping(
    @Param('integrationId', ParseUUIDPipe) integrationId: string,
    @Param('mappingId', ParseUUIDPipe) mappingId: string,
    @Body() dto: ReplaceUtilityMeterMappingDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.integrations.replaceMapping(societyId, this.requireUser(userId), integrationId, mappingId, dto);
  }

  @Get('receipts')
  @RequiresPermissions(AppPermission.FACILITIES_READ)
  receipts(@CurrentTenant() societyId: string) {
    return this.integrations.listReceipts(societyId);
  }

  @Get('events')
  @RequiresPermissions(AppPermission.FACILITIES_READ)
  events(@CurrentTenant() societyId: string) {
    return this.integrations.listEvents(societyId);
  }

  @Post('receipts/:receiptId/dismiss')
  @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  dismissReceipt(
    @Param('receiptId', ParseUUIDPipe) receiptId: string,
    @Body() dto: UtilityIngestionResolutionDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.integrations.dismissReceipt(societyId, this.requireUser(userId), receiptId, dto);
  }

  @Post('receipts/:receiptId/reprocess')
  @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  reprocessReceipt(
    @Param('receiptId', ParseUUIDPipe) receiptId: string,
    @Body() dto: UtilityIngestionResolutionDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.integrations.reprocessReceipt(societyId, this.requireUser(userId), receiptId, dto);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}

@Controller('utility-integrations/v2/readings')
export class UtilityIntegrationIngestionController {
  constructor(private readonly integrations: UtilityIntegrationsService) {}

  @Post()
  @HttpCode(200)
  ingest(
    @Headers('x-aaraagate-integration-key') integrationKey: string | undefined,
    @Body() dto: IngestUtilityReadingDto,
  ) {
    return this.integrations.ingest(integrationKey, dto);
  }
}
