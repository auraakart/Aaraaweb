import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AppRole } from '../auth/auth.types';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { UniversalSearchService } from './universal-search.service';

@Controller('search')
@UseGuards(BearerGuard, TenantGuard)
export class UniversalSearchController {
  constructor(private readonly searchService: UniversalSearchService) {}

  @Get()
  search(
    @CurrentTenant() societyId: string,
    @Req() request: AuthenticatedRequest,
    @Query('q') query?: string,
    @Query('unitId') unitId?: string,
  ) {
    const auth = request.auth;
    if (!auth?.userId || !auth.roles?.length) throw new BadRequestException('Authenticated user context is required');
    return this.searchService.search(societyId, auth.userId, auth.roles as AppRole[], query ?? '', unitId);
  }
}
