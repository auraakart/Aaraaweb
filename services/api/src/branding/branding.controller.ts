import { BadRequestException, Body, Controller, Get, Header, Param, ParseUUIDPipe, PipeTransform, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsInt, IsObject, Min } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { BrandingService } from './branding.service';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { TenantGuard } from '../auth/tenant.guard';

// Explicit pipe avoids relying on validation metadata for an empty DTO.
export class BrandingQueryPipe implements PipeTransform {
  transform(value: unknown): void {
    if (value && typeof value === 'object' && Object.keys(value).length === 0) return;
    throw new BadRequestException('Branding configuration does not accept query selectors');
  }
}

@Controller('branding')
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  @Get('bootstrap')
  @Header('Cache-Control', 'no-store')
  bootstrap(@Query(new BrandingQueryPipe()) _query: void) {
    void _query;
    return this.branding.bootstrap();
  }
}

@Controller('context')
@UseGuards(BearerGuard)
export class BrandingContextController {
  constructor(private readonly branding: BrandingService) {}

  @Get('config')
  @Header('Cache-Control', 'no-store')
  config(@Req() request: AuthenticatedRequest, @Query(new BrandingQueryPipe()) _query: void) {
    void _query;
    return this.branding.context(request.auth);
  }
}

class SocietyBrandDraftDto {
  @IsInt() @Min(0) expectedVersion!: number;
  @IsObject() config!: Record<string, unknown>;
}

class SocietyBrandPublishDto {
  @IsInt() @Min(0) expectedPublishedVersion!: number;
}

@Controller('branding/manage')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
@RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
export class BrandingManageController {
  constructor(private readonly branding: BrandingService) {}

  @Get('revisions')
  @Header('Cache-Control', 'no-store')
  history(@Req() request: AuthenticatedRequest) {
    return this.branding.history(request.auth!.societyId!, request.auth!.userId);
  }

  @Post('drafts')
  @Header('Cache-Control', 'no-store')
  create(@Req() request: AuthenticatedRequest, @Body() input: SocietyBrandDraftDto) {
    return this.branding.createDraft(request.auth!.societyId!, request.auth!.userId, input);
  }

  @Post('drafts/:revisionId/publish')
  @Header('Cache-Control', 'no-store')
  publish(@Req() request: AuthenticatedRequest, @Param('revisionId', ParseUUIDPipe) revisionId: string, @Body() input: SocietyBrandPublishDto) {
    return this.branding.publish(request.auth!.societyId!, request.auth!.userId, revisionId, input.expectedPublishedVersion);
  }
}
