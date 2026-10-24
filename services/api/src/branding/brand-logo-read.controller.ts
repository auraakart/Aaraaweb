import { Controller, Get, Header, Headers, Query, Req, StreamableFile, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { BrandingQueryPipe } from './branding.controller';
import { PublishedBrandLogoService } from './brand-logo-read.service';

@Controller('context')
@UseGuards(BearerGuard)
export class BrandLogoReadController {
  constructor(private readonly logos: PublishedBrandLogoService) {}

  @Get('logo')
  @Header('Cache-Control', 'private, no-store, no-cache, max-age=0')
  @Header('Pragma', 'no-cache')
  @Header('Vary', 'Authorization')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  async publishedLogo(
    @Req() request: AuthenticatedRequest,
    @Headers('if-match') expectedRevision: string | undefined,
    @Query(new BrandingQueryPipe()) _query: void,
  ): Promise<StreamableFile> {
    void _query;
    // Buffer never escapes through JSON, a signed S3 URL or a public asset key.
    const bytes = await this.logos.readPublished(request.auth, expectedRevision?.replace(/^"|"$/g, ''));
    return new StreamableFile(bytes, { type: 'image/png' });
  }
}
