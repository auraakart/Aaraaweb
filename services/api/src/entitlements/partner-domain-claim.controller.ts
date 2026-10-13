import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, IsUUID, MaxLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { PartnerDomainClaimService } from './partner-domain-claim.service';

class RegisterPartnerDomainDto {
  @IsString() @MaxLength(253) hostname!:string;
  @IsUUID() idempotencyKey!:string;
}
/** Authenticated owner scope; never reads caller-provided partner roles. */
@Controller('partners/:partnerId/domains')
@UseGuards(BearerGuard)
export class PartnerDomainClaimController {
  constructor(private readonly claims:PartnerDomainClaimService) {}
  @Get() @Header('Cache-Control','no-store')
  list(@Req() req:AuthenticatedRequest,@Param('partnerId',ParseUUIDPipe) partnerId:string) {
    return this.claims.list(req.auth!.userId,partnerId);
  }
  @Post() @Header('Cache-Control','no-store')
  register(@Req() req:AuthenticatedRequest,@Param('partnerId',ParseUUIDPipe) partnerId:string,@Body() dto:RegisterPartnerDomainDto) {
    return this.claims.register(req.auth!.userId,partnerId,dto);
  }
}
