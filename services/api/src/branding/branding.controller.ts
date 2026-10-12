import { BadRequestException, Body, Controller, Get, Header, PipeTransform, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { BrandingService } from './branding.service';

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

/** Own-society presentation editor; never accepts caller-selected partner/society IDs. */
@Controller('branding/manage')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
@RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
export class SocietyBrandEditorController {
  constructor(private readonly branding: BrandingService) {}

  @Get('history')
  @Header('Cache-Control','no-store')
  history(@Req() request: AuthenticatedRequest, @Query(new BrandingQueryPipe()) _query: void) {
    void _query;
    return this.branding.listRevisions(request.auth);
  }

  @Post('draft')
  @Header('Cache-Control','no-store')
  createDraft(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.branding.createDraft(request.auth, body);
  }

  @Post('publish')
  @Header('Cache-Control','no-store')
  publish(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.branding.publishDraft(request.auth, body);
  }

  @Post('restore')
  @Header('Cache-Control','no-store')
  restore(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.branding.restorePublished(request.auth, body);
  }
}
