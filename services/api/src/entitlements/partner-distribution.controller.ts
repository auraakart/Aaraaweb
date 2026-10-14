import { Body, Controller, Header, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { IsInt, IsObject, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AppRole } from '../auth/auth.types';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PartnerDistributionService } from './partner-distribution.service';
import { LegacySubscriptionConversionService } from './legacy-subscription-conversion.service';
class ContextDto {
 @IsUUID() grantId!:string;
 @IsUUID() allocationId!:string;
 @IsInt() @Min(1) @Max(2147483647) expectedGrantVersion!:number;
 @IsInt() @Min(1) @Max(2147483647) expectedOwnershipVersion!:number;
 @IsUUID() idempotencyKey!:string;
}
class ProposalDto extends ContextDto { @IsObject() manifest!:Record<string,unknown> }
class ApprovalDto extends ContextDto {
 @IsString() @Matches(/^[0-9a-f]{64}$/) expectedDigest!:string;
 @IsString() @MinLength(3) @MaxLength(500) reason!:string;
}
class RevokeDto {
 @IsUUID() idempotencyKey!:string;
 @IsString() @MinLength(3) @MaxLength(500) reason!:string;
}
@Controller('licensing/societies/:societyId')
@UseGuards(BearerGuard,RolesGuard)
@Roles(AppRole.SUPER_ADMIN)
export class PartnerDistributionController {
 constructor(private readonly distributions:PartnerDistributionService,private readonly subscriptions:LegacySubscriptionConversionService) {}
 @Post('distributions') @Header('Cache-Control','no-store')
 propose(@Req() req:AuthenticatedRequest,@Param('societyId',ParseUUIDPipe) societyId:string,@Body() dto:ProposalDto){return this.distributions.propose(req.auth!,societyId,dto);}
 @Post('distributions/:proposalId/approvals') @Header('Cache-Control','no-store')
 approve(@Req() req:AuthenticatedRequest,@Param('societyId',ParseUUIDPipe) societyId:string,@Param('proposalId',ParseUUIDPipe) proposalId:string,@Body() dto:ApprovalDto){return this.distributions.approve(req.auth!,societyId,proposalId,dto);}
 @Post('distributions/:proposalId/approved-input') @Header('Cache-Control','no-store')
 approved(@Req() req:AuthenticatedRequest,@Param('societyId',ParseUUIDPipe) societyId:string,@Param('proposalId',ParseUUIDPipe) proposalId:string,@Body() dto:ContextDto){return this.distributions.approved(req.auth!,societyId,proposalId,dto);}
 @Post('distributions/:proposalId/revocations') @Header('Cache-Control','no-store')
 revoke(@Req() req:AuthenticatedRequest,@Param('societyId',ParseUUIDPipe) societyId:string,@Param('proposalId',ParseUUIDPipe) proposalId:string,@Body() dto:RevokeDto){return this.distributions.revoke(req.auth!,societyId,proposalId,dto);}
 @Post('legacy-subscriptions/conversions') @Header('Cache-Control','no-store')
 convert(@Req() req:AuthenticatedRequest,@Param('societyId',ParseUUIDPipe) societyId:string,@Body() dto:ContextDto){return this.subscriptions.convert(req.auth!,societyId,dto);}
}
