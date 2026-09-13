import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { PrivacyRegistryService } from './privacy-registry.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class CreateDataCategoryDto {
  @IsString() @MaxLength(64) code!: string;
  @IsString() @MaxLength(160) name!: string;
  @IsString() @MaxLength(1000) purpose!: string;
  @IsOptional() @IsString() @MaxLength(500) legalBasis?: string;
  @IsString() @MaxLength(500) retentionTrigger!: string;
  @IsOptional() @IsInt() @Min(0) @Max(36500) retentionDays?: number;
  @IsOptional() @IsBoolean() containsSensitiveData?: boolean;
  @IsOptional() @IsBoolean() containsMinorData?: boolean;
}

class CreateProcessorDto {
  @IsString() @MaxLength(200) name!: string;
  @IsString() @MaxLength(1000) purpose!: string;
  @IsArray() @IsString({ each: true }) dataCategoryCodes!: string[];
  @IsOptional() @IsString() @MaxLength(240) processingLocation?: string;
  @IsOptional() @IsString() @MaxLength(500) contactReference?: string;
  @IsOptional() @IsString() @MaxLength(500) agreementReference?: string;
}

class SetActiveDto {
  @IsBoolean() active!: boolean;
}

@Controller('privacy/registry')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class PrivacyRegistryController {
  constructor(private readonly registry: PrivacyRegistryService) {}

  @Get('categories')
  @RequiresPermissions(AppPermission.PRIVACY_OPERATIONS_READ)
  listCategories(@CurrentTenant() societyId: string) {
    return this.registry.listCategories(societyId);
  }

  @Post('categories')
  @RequiresPermissions(AppPermission.PRIVACY_OPERATIONS_MANAGE)
  createCategory(@Body() dto: CreateDataCategoryDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.registry.createCategory(societyId, this.requireUser(userId), dto);
  }

  @Patch('categories/:categoryId/active')
  @RequiresPermissions(AppPermission.PRIVACY_OPERATIONS_MANAGE)
  setCategoryActive(
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: SetActiveDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.registry.setCategoryActive(societyId, this.requireUser(userId), categoryId, dto.active);
  }

  @Get('categories/:categoryId/history')
  @RequiresPermissions(AppPermission.PRIVACY_OPERATIONS_READ)
  categoryHistory(@Param('categoryId', ParseUUIDPipe) categoryId: string, @CurrentTenant() societyId: string) {
    return this.registry.history(societyId, 'DATA_CATEGORY', categoryId);
  }

  @Get('processors')
  @RequiresPermissions(AppPermission.PRIVACY_OPERATIONS_READ)
  listProcessors(@CurrentTenant() societyId: string) {
    return this.registry.listProcessors(societyId);
  }

  @Post('processors')
  @RequiresPermissions(AppPermission.PRIVACY_OPERATIONS_MANAGE)
  createProcessor(@Body() dto: CreateProcessorDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.registry.createProcessor(societyId, this.requireUser(userId), dto);
  }

  @Patch('processors/:processorId/active')
  @RequiresPermissions(AppPermission.PRIVACY_OPERATIONS_MANAGE)
  setProcessorActive(
    @Param('processorId', ParseUUIDPipe) processorId: string,
    @Body() dto: SetActiveDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.registry.setProcessorActive(societyId, this.requireUser(userId), processorId, dto.active);
  }

  @Get('processors/:processorId/history')
  @RequiresPermissions(AppPermission.PRIVACY_OPERATIONS_READ)
  processorHistory(@Param('processorId', ParseUUIDPipe) processorId: string, @CurrentTenant() societyId: string) {
    return this.registry.history(societyId, 'PROCESSOR', processorId);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
