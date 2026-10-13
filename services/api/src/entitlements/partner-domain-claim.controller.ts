import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { PartnerDomainVerificationService } from './partner-domain-verification.service';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { PartnerDomainClaimService } from './partner-domain-claim.service';

class PartnerDomainProofDto {
  @IsString() @Matches(/^[0-9a-f]{64}$/) challenge!:string;
}
class RegisterPartnerDomainDto {
  @IsString() @MaxLength(253) hostname!:string;
  @IsUUID() idempotencyKey!:string;
}
/** Authenticated owner scope; never reads caller-provided partner roles. */
@Controller('partners/:partnerId/domains')
@UseGuards(BearerGuard)
export class PartnerDomainClaimController {
  constructor(private readonly claims:PartnerDomainClaimService, private readonly verifier:PartnerDomainVerificationService) {}
  @Get() @Header('Cache-Control','no-store')
  list(@Req() req:AuthenticatedRequest,@Param('partnerId',ParseUUIDPipe) partnerId:string) {
    return this.claims.list(req.auth!.userId,partnerId);
  }
  @Post(':claimId/verify') @Header('Cache-Control','no-store')
  verify(@Req() req:AuthenticatedRequest,@Param('partnerId',ParseUUIDPipe) partnerId:string,@Param('claimId',ParseUUIDPipe) claimId:string,@Body() dto:PartnerDomainProofDto) {
    return this.verifier.verify(req.auth!.userId,partnerId,claimId,dto.challenge);
  }
  @Post() @Header('Cache-Control','no-store')
  register(@Req() req:AuthenticatedRequest,@Param('partnerId',ParseUUIDPipe) partnerId:string,@Body() dto:RegisterPartnerDomainDto) {
    return this.claims.register(req.auth!.userId,partnerId,dto);
  }
}
