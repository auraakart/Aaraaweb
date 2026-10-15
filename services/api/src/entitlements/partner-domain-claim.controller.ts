import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { IsInt, IsString, IsUUID, Matches, MaxLength, Min } from 'class-validator';
import { PartnerDomainVerificationService } from './partner-domain-verification.service';
import { AuthenticatedRequest } from '../auth/bearer.guard';
import { PartnerBearerGuard } from '../auth/partner-bearer.guard';
import { PartnerDomainClaimService } from './partner-domain-claim.service';

class PartnerDomainLifecycleDto {
  @IsInt() @Min(1) expectedVersion!:number;
  @IsUUID() idempotencyKey!:string;
  @IsString() @MaxLength(500) reason!:string;
}
class PartnerDomainProofDto {
  @IsString() @Matches(/^[0-9a-f]{64}$/) challenge!:string;
}
class RegisterPartnerDomainDto {
  @IsString() @MaxLength(253) hostname!:string;
  @IsUUID() idempotencyKey!:string;
}
/** Authenticated owner scope; never reads caller-provided partner roles. */
@Controller('partners/:partnerId/domains')
@UseGuards(PartnerBearerGuard)
export class PartnerDomainClaimController {
  constructor(private readonly claims:PartnerDomainClaimService, private readonly verifier:PartnerDomainVerificationService) {}
  @Get() @Header('Cache-Control','no-store')
  list(@Req() req:AuthenticatedRequest,@Param('partnerId',ParseUUIDPipe) partnerId:string) {
    return this.claims.list(req.auth!.userId,partnerId);
  }
  @Post(':claimId/revoke') @Header('Cache-Control','no-store')
  revoke(@Req() req:AuthenticatedRequest,@Param('partnerId',ParseUUIDPipe) partnerId:string,@Param('claimId',ParseUUIDPipe) claimId:string,@Body() dto:PartnerDomainLifecycleDto) {
    return this.claims.revoke(req.auth!.userId,partnerId,claimId,dto);
  }
  @Post(':claimId/reissue') @Header('Cache-Control','no-store')
  reissue(@Req() req:AuthenticatedRequest,@Param('partnerId',ParseUUIDPipe) partnerId:string,@Param('claimId',ParseUUIDPipe) claimId:string,@Body() dto:PartnerDomainLifecycleDto) {
    return this.claims.reissue(req.auth!.userId,partnerId,claimId,dto);
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
