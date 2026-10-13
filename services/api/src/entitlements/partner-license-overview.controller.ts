import { Controller, Get, Header, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import { AppRole } from '../auth/auth.types';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PartnerLicenseOverviewService } from './partner-license-overview.service';
@Controller('licensing/societies/:societyId')
@UseGuards(BearerGuard,RolesGuard)
@Roles(AppRole.SOCIETY_ADMIN,AppRole.SUPER_ADMIN)
export class PartnerLicenseOverviewController {
 constructor(private readonly licenses:PartnerLicenseOverviewService) {}
 @Get('overview') @Header('Cache-Control','no-store')
 overview(@Req() request:AuthenticatedRequest,@Param('societyId',ParseUUIDPipe) societyId:string){return this.licenses.overview(request.auth!,societyId);}
 @Get('domain-preview') @Header('Cache-Control','no-store')
 preview(@Req() request:AuthenticatedRequest,@Param('societyId',ParseUUIDPipe) societyId:string,@Query('hostname') hostname:string){return this.licenses.domainPreview(request.auth!,societyId,hostname);}
}
