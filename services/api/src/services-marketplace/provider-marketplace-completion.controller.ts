import { Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Patch, Post, Query, UnauthorizedException, UseGuards, createParamDecorator } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { ProviderMarketplaceCompletionService } from './provider-marketplace-completion.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);
const requireUser=(id?:string)=>{if(!id)throw new UnauthorizedException('Authentication required');return id};

class ProviderApplicationDto{
 @IsString() @MinLength(2) @MaxLength(160) businessName!:string;
 @IsOptional() @IsString() @MaxLength(120) contactName?:string;
 @IsString() @MinLength(8) @MaxLength(30) phone!:string;
 @IsOptional() @IsEmail() email?:string;
 @IsOptional() @IsString() @MaxLength(2000) description?:string;
 @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('4',{each:true}) requestedCategoryIds?:string[];
 @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({each:true}) evidenceRefs?:string[];
}
class ReviewApplicationDto{@IsIn(['APPROVE','REJECT']) decision!:'APPROVE'|'REJECT';@IsString() @MinLength(3) @MaxLength(1000) note!:string;}
class OfferingDto{
 @IsUUID() categoryId!:string; @IsString() @MinLength(2) @MaxLength(160) name!:string;
 @IsOptional() @IsString() @MaxLength(2000) description?:string;
 @Type(()=>Number) @IsInt() @Min(0) pricePaise!:number;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(5) @Max(1440) durationMinutes?:number;
 @IsOptional() @IsBoolean() active?:boolean;
}
class OfferingPatchDto{
 @IsOptional() @IsUUID() categoryId?:string; @IsOptional() @IsString() @MinLength(2) @MaxLength(160) name?:string;
 @IsOptional() @IsString() @MaxLength(2000) description?:string;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(0) pricePaise?:number;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(5) @Max(1440) durationMinutes?:number;
 @IsOptional() @IsBoolean() active?:boolean;
}
class ProposalDto{@IsISO8601() proposedFrom!:string;@IsISO8601() proposedUntil!:string;@IsOptional() @IsString() @MaxLength(1000) note?:string;}
class ProposalDecisionDto{@IsIn(['ACCEPT','REJECT']) decision!:'ACCEPT'|'REJECT';@IsOptional() @IsString() @MaxLength(500) reason?:string;}
class ExtraWorkQuoteDto {
 @IsString() @MinLength(10) @MaxLength(1500) scopeDescription!:string;
 @Type(()=>Number) @IsInt() @Min(1) @Max(100000000) amountPaise!:number;
 @IsString() @MinLength(8) @MaxLength(120) idempotencyKey!:string;
}
class ExtraWorkQuoteDecisionDto {
 @IsIn(['APPROVE','DECLINE']) decision!:'APPROVE'|'DECLINE';
 @IsOptional() @IsString() @MaxLength(500) reason?:string;
}
class ExtraWorkQuoteWithdrawalDto{
 @IsString() @MinLength(3) @MaxLength(500) reason!:string;
}
class EvidenceDto{@IsIn(['NOTE','REFERENCE']) evidenceType!:'NOTE'|'REFERENCE';@IsOptional() @IsString() @MaxLength(1000) reference?:string;@IsOptional() @IsString() @MaxLength(2000) note?:string;}
class DisputeDto{@IsString() @MinLength(2) @MaxLength(80) reasonCode!:string;@IsString() @MinLength(5) @MaxLength(2000) detail!:string;}
class DisputeEvidenceDto {
 @IsString() @MinLength(5) @MaxLength(2000) note!:string;
 @IsOptional() @IsString() @MaxLength(400) reference?:string;
 @IsString() @MinLength(8) @MaxLength(120) idempotencyKey!:string;
}
class DisputeResolutionDto{@IsIn(['RESOLVED','DISMISSED']) status!:'RESOLVED'|'DISMISSED';@IsString() @MinLength(5) @MaxLength(2000) resolutionNote!:string;}
class ExceptionDto{@IsISO8601({strict:true}) serviceDate!:string;@IsBoolean() closed!:boolean;@IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(1000) slotCapacity?:number;@IsOptional() @IsString() @MaxLength(500) note?:string;@IsOptional() @IsBoolean() active?:boolean;}

@Controller('provider-onboarding')
@UseGuards(BearerGuard)
export class ProviderOnboardingController{
 constructor(private readonly svc:ProviderMarketplaceCompletionService){}
 @Get('me') get(@CurrentUser() u:string|undefined){return this.svc.getMyApplication(requireUser(u));}
 @Post('applications') save(@CurrentUser() u:string|undefined,@Body() d:ProviderApplicationDto){return this.svc.saveMyApplication(requireUser(u),d);}
 @Post('applications/submit') submit(@CurrentUser() u:string|undefined){return this.svc.submitMyApplication(requireUser(u));}
}

@Controller('platform/services/provider-applications')
@UseGuards(BearerGuard,PermissionsGuard)
export class PlatformProviderApplicationController{
 constructor(private readonly svc:ProviderMarketplaceCompletionService){}
 @Get() @RequiresPermissions(AppPermission.PLATFORM_PROVIDER_VERIFY) list(@Query('status') status?:string){return this.svc.listApplications(status);}
 @Post(':id/review') @RequiresPermissions(AppPermission.PLATFORM_PROVIDER_VERIFY)
 review(@CurrentUser() u:string|undefined,@Param('id',ParseUUIDPipe) id:string,@Body() d:ReviewApplicationDto){return this.svc.reviewApplication(requireUser(u),id,d.decision,d.note);}
}

@Controller('provider/services')
@UseGuards(BearerGuard)
export class ProviderMarketplaceCompletionController{
 constructor(private readonly svc:ProviderMarketplaceCompletionService){}
 @Get('categories') categories(){return this.svc.listCategories();}
 @Post('offerings') createOffering(@CurrentUser() u:string|undefined,@Body() d:OfferingDto){return this.svc.createMyOffering(requireUser(u),d);}
 @Patch('offerings/:id') updateOffering(@CurrentUser() u:string|undefined,@Param('id',ParseUUIDPipe) id:string,@Body() d:OfferingPatchDto){return this.svc.updateMyOffering(requireUser(u),id,d);}
 @Get('offerings/:id/events') offeringEvents(@CurrentUser() u:string|undefined,@Param('id',ParseUUIDPipe) id:string){return this.svc.listMyOfferingEvents(requireUser(u),id);}
 @Post('bookings/:id/proposals') proposal(@CurrentUser() u:string|undefined,@Param('id',ParseUUIDPipe) id:string,@Body() d:ProposalDto){return this.svc.proposeBookingTime(requireUser(u),id,new Date(d.proposedFrom),new Date(d.proposedUntil),d.note);}
 @Post('bookings/:id/extra-work-quotes') createQuote(@CurrentUser() u:string|undefined,
  @Param('id',ParseUUIDPipe) id:string,@Body() d:ExtraWorkQuoteDto){
  return this.svc.proposeExtraWorkQuote(requireUser(u),id,d.scopeDescription,d.amountPaise,d.idempotencyKey);
 }
 @Post('bookings/:bookingId/extra-work-quotes/:quoteId/withdraw')
 withdrawQuote(@CurrentUser() u:string|undefined,@Param('bookingId',ParseUUIDPipe) bookingId:string,
  @Param('quoteId',ParseUUIDPipe) quoteId:string,@Body() d:ExtraWorkQuoteWithdrawalDto){
  return this.svc.withdrawExtraWorkQuote(requireUser(u),bookingId,quoteId,d.reason);
 }
 @Get('bookings/:id/extra-work-quotes') providerQuotes(@CurrentUser() u:string|undefined,
  @Param('id',ParseUUIDPipe) id:string){return this.svc.listProviderExtraWorkQuotes(requireUser(u),id);}
 @Get('bookings/:bookingId/extra-work-billing-requests/:requestId/finance-handoff')
 financeHandoff(@CurrentUser() u:string|undefined,
  @Param('bookingId',ParseUUIDPipe) bookingId:string,@Param('requestId',ParseUUIDPipe) requestId:string){
  return this.svc.getExtraWorkFinanceHandoff(requireUser(u),bookingId,requestId);
 }
 @Post('bookings/:bookingId/extra-work-billing-requests/:requestId/prepare-draft')
 prepareBillingDraft(@CurrentUser() u:string|undefined,
  @Param('bookingId',ParseUUIDPipe) bookingId:string,@Param('requestId',ParseUUIDPipe) requestId:string){
  return this.svc.prepareExtraWorkBillingDraft(requireUser(u),bookingId,requestId);
 }
 @Post('bookings/:bookingId/extra-work-billing-requests/:requestId/acknowledge')
 acknowledgeExtraWorkBillRequest(@CurrentUser() u:string|undefined,
  @Param('bookingId',ParseUUIDPipe) bookingId:string,@Param('requestId',ParseUUIDPipe) requestId:string){
  return this.svc.acknowledgeExtraWorkBillRequest(requireUser(u),bookingId,requestId);
 }
 @Get('bookings/:id/extra-work-billing-requests') providerExtraWorkBillRequests(
   @CurrentUser() u:string|undefined,@Param('id',ParseUUIDPipe) id:string){
   return this.svc.listProviderExtraWorkBillRequests(requireUser(u),id);
 }
 @Post('bookings/:id/completion-evidence') evidence(@CurrentUser() u:string|undefined,@Param('id',ParseUUIDPipe) id:string,@Body() d:EvidenceDto){return this.svc.addCompletionEvidence(requireUser(u),id,d.evidenceType,d.reference,d.note);}
 @Get('disputes') disputes(@CurrentUser() u:string|undefined){return this.svc.listMyDisputes(requireUser(u));}
 @Get('disputes/:id/evidence') disputeEvidence(@CurrentUser() u:string|undefined,@Param('id',ParseUUIDPipe) id:string){
  return this.svc.listDisputeEvidence(requireUser(u),id,'PROVIDER');
 }
 @Post('disputes/:id/evidence') addDisputeEvidence(@CurrentUser() u:string|undefined,@Param('id',ParseUUIDPipe) id:string,@Body() d:DisputeEvidenceDto){
  return this.svc.addDisputeEvidence(requireUser(u),id,'PROVIDER',d.note,d.idempotencyKey,d.reference);
 }
 @Get('offerings/:id/availability-exceptions') exceptions(@CurrentUser() u:string|undefined,@Param('id',ParseUUIDPipe) id:string){return this.svc.listAvailabilityExceptions(requireUser(u),id);}
 @Post('offerings/:id/availability-exceptions') setException(@CurrentUser() u:string|undefined,@Param('id',ParseUUIDPipe) id:string,@Body() d:ExceptionDto){return this.svc.setAvailabilityException(requireUser(u),id,d);}
 @Get('readiness') readiness(@CurrentUser() u:string|undefined){return this.svc.getProviderReadiness(requireUser(u));}
}

@Controller('consumer/services')
@UseGuards(BearerGuard)
export class ConsumerMarketplaceCompletionController{
 constructor(private readonly svc:ProviderMarketplaceCompletionService){}
 @Get('bookings/:id/proposals') proposals(@CurrentUser() u:string|undefined,@Param('id',ParseUUIDPipe) id:string){return this.svc.listConsumerProposals(requireUser(u),id);}
 @Post('bookings/:bookingId/proposals/:proposalId/respond') respond(@CurrentUser() u:string|undefined,@Param('bookingId',ParseUUIDPipe) bookingId:string,@Param('proposalId',ParseUUIDPipe) proposalId:string,@Body() d:ProposalDecisionDto){return this.svc.respondToProposal(requireUser(u),bookingId,proposalId,d.decision,d.reason);}
 @Get('bookings/:id/extra-work-quotes') consumerQuotes(@CurrentUser() u:string|undefined,
  @Param('id',ParseUUIDPipe) id:string){return this.svc.listConsumerExtraWorkQuotes(requireUser(u),id);}
 @Post('bookings/:bookingId/extra-work-quotes/:quoteId/respond') respondQuote(@CurrentUser() u:string|undefined,
  @Param('bookingId',ParseUUIDPipe) bookingId:string,@Param('quoteId',ParseUUIDPipe) quoteId:string,
  @Body() d:ExtraWorkQuoteDecisionDto){
  return this.svc.respondToExtraWorkQuote(requireUser(u),bookingId,quoteId,d.decision,d.reason);
 }
 @Get('bookings/:id/extra-work-billing-requests') consumerExtraWorkBillRequests(
   @CurrentUser() u:string|undefined,@Param('id',ParseUUIDPipe) id:string){
   return this.svc.listConsumerExtraWorkBillRequests(requireUser(u),id);
 }
 @Post('bookings/:bookingId/extra-work-quotes/:quoteId/request-separate-bill')
 requestSeparateBill(@CurrentUser() u:string|undefined,
   @Param('bookingId',ParseUUIDPipe) bookingId:string,@Param('quoteId',ParseUUIDPipe) quoteId:string){
   return this.svc.requestExtraWorkBill(requireUser(u),bookingId,quoteId);
 }
 @Get('bookings/:id/completion-evidence') evidence(@CurrentUser() u:string|undefined,@Param('id',ParseUUIDPipe) id:string){return this.svc.listConsumerEvidence(requireUser(u),id);}
 @Post('bookings/:id/disputes') dispute(@CurrentUser() u:string|undefined,@Param('id',ParseUUIDPipe) id:string,@Body() d:DisputeDto){return this.svc.openDispute(requireUser(u),id,d.reasonCode,d.detail);}
 @Get('bookings/:id/disputes') consumerDisputes(@CurrentUser() u:string|undefined,@Param('id',ParseUUIDPipe) id:string){return this.svc.listConsumerDisputes(requireUser(u),id);}
 @Get('bookings/:bookingId/disputes/:disputeId/evidence') disputeEvidence(
   @CurrentUser() u:string|undefined,@Param('bookingId',ParseUUIDPipe) bookingId:string,
   @Param('disputeId',ParseUUIDPipe) disputeId:string){
   return this.svc.listDisputeEvidence(requireUser(u),disputeId,'RESIDENT',bookingId);
 }
 @Post('bookings/:bookingId/disputes/:disputeId/evidence') addDisputeEvidence(
   @CurrentUser() u:string|undefined,@Param('bookingId',ParseUUIDPipe) bookingId:string,
   @Param('disputeId',ParseUUIDPipe) disputeId:string,@Body() d:DisputeEvidenceDto){
   return this.svc.addDisputeEvidence(requireUser(u),disputeId,'RESIDENT',d.note,d.idempotencyKey,d.reference,bookingId);
 }
}

@Controller('platform/services/disputes')
@UseGuards(BearerGuard,PermissionsGuard)
export class PlatformMarketplaceCompletionController{
 constructor(private readonly svc:ProviderMarketplaceCompletionService){}
 @Get() @RequiresPermissions(AppPermission.PLATFORM_PROVIDER_VERIFY) list(@Query('status') status?:string){return this.svc.listPlatformDisputes(status);}
 @Get(':id/evidence') @RequiresPermissions(AppPermission.PLATFORM_PROVIDER_VERIFY)
 evidence(@Param('id',ParseUUIDPipe) id:string){return this.svc.listPlatformDisputeEvidence(id);}
 @Post(':id/resolve') @RequiresPermissions(AppPermission.PLATFORM_PROVIDER_VERIFY)
 resolve(@CurrentUser() u:string|undefined,@Param('id',ParseUUIDPipe) id:string,@Body() d:DisputeResolutionDto){return this.svc.resolveDispute(requireUser(u),id,d.status,d.resolutionNote);}
}
