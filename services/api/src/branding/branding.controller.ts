import { BadRequestException, Controller, Get, Header, PipeTransform, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
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
