import { Controller, Get, Header, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/bearer.guard';
import { PartnerBearerGuard } from '../auth/partner-bearer.guard';
import { PartnerPortfolioReadService } from './partner-portfolio-read.service';

/**
 * Partner roles are reloaded by the service from PartnerMembership on every
 * request. Do not reuse SocietyMembership RolesGuard or trust a client role.
 */
@Controller('partners')
@UseGuards(PartnerBearerGuard)
export class PartnerPortfolioReadController {
  constructor(private readonly portfolioReader: PartnerPortfolioReadService) {}

  @Get('workspaces')
  @Header('Cache-Control', 'no-store')
  workspaces(@Req() request: AuthenticatedRequest) {
    return this.portfolioReader.workspaces(request.auth!.userId);
  }

  @Get(':partnerId/portfolio')
  @Header('Cache-Control', 'no-store')
  portfolio(
    @Req() request: AuthenticatedRequest,
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
  ) {
    return this.portfolioReader.portfolio(request.auth!.userId, partnerId);
  }

  @Get(':partnerId/members')
  @Header('Cache-Control', 'no-store')
  members(
    @Req() request: AuthenticatedRequest,
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
  ) {
    return this.portfolioReader.members(request.auth!.userId, partnerId);
  }
}
