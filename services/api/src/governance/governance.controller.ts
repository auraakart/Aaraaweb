import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { GovernanceService } from './governance.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);
class CreateTenureDto{@IsUUID() userId!:string;@IsString() @MinLength(1) @MaxLength(120) roleName!:string;@IsISO8601() effectiveFrom!:string;@IsOptional() @IsISO8601() effectiveTo?:string;}
class EndTenureDto{@IsISO8601() effectiveTo!:string;@IsOptional() @IsString() @MaxLength(2000) handoverNotes?:string;}
class CreateMeetingDto{@IsIn(['AGM','SGM','COMMITTEE','BUSINESS']) meetingType!:'AGM'|'SGM'|'COMMITTEE'|'BUSINESS';@IsString() @MinLength(1) @MaxLength(240) title!:string;@IsISO8601() scheduledAt!:string;@IsOptional() @IsString() @MaxLength(240) location?:string;@IsOptional() @IsInt() @Min(0) quorumRequired?:number;@IsOptional() @IsString() @MaxLength(500) quorumRuleReference?:string;@IsOptional() @IsString() @MaxLength(500) byeLawReference?:string;}
class MeetingOutcomeDto{@IsIn(['SCHEDULED','HELD','CANCELLED']) status!:'SCHEDULED'|'HELD'|'CANCELLED';@IsOptional() @IsISO8601() heldAt?:string;@IsOptional() @IsInt() @Min(0) quorumPresent?:number;@IsOptional() @IsString() @MaxLength(10000) minutesSummary?:string;@IsOptional() @IsString() @MaxLength(500) quorumRuleReference?:string;@IsOptional() @IsString() @MaxLength(500) byeLawReference?:string;}
class AgendaDto{@IsInt() @Min(1) ordinal!:number;@IsString() @MinLength(1) @MaxLength(240) title!:string;@IsOptional() @IsString() @MaxLength(5000) description?:string;}
class ResolutionDto{@IsOptional() @IsUUID() agendaItemId?:string;@IsString() @MinLength(1) @MaxLength(240) title!:string;@IsString() @MinLength(1) @MaxLength(10000) resolutionText!:string;@IsIn(['PROPOSED','PASSED','REJECTED','WITHDRAWN']) status!:'PROPOSED'|'PASSED'|'REJECTED'|'WITHDRAWN';@IsOptional() @IsInt() @Min(0) approvalRequired?:number;@IsOptional() @IsInt() @Min(0) approvalRecorded?:number;@IsOptional() @IsString() @MaxLength(500) approvalRuleReference?:string;@IsOptional() @IsString() @MaxLength(500) byeLawReference?:string;}
class ActionDto{@IsOptional() @IsUUID() resolutionId?:string;@IsString() @MinLength(1) @MaxLength(240) title!:string;@IsOptional() @IsString() @MaxLength(5000) description?:string;@IsOptional() @IsUUID() ownerUserId?:string;@IsOptional() @IsISO8601() dueAt?:string;}

@Controller('governance')
@UseGuards(BearerGuard,TenantGuard,PermissionsGuard)
export class GovernanceController{
  constructor(private readonly governance:GovernanceService){}
  @Get('committee') @RequiresPermissions(AppPermission.GOVERNANCE_READ) listCommittee(@CurrentTenant() societyId:string){return this.governance.listCommittee(societyId);}
  @Post('committee/tenures') @RequiresPermissions(AppPermission.GOVERNANCE_MANAGE) createTenure(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:CreateTenureDto){return this.governance.createTenure(societyId,this.user(userId),{...dto,effectiveFrom:new Date(dto.effectiveFrom),effectiveTo:dto.effectiveTo?new Date(dto.effectiveTo):undefined});}
  @Post('committee/tenures/:id/end') @RequiresPermissions(AppPermission.GOVERNANCE_MANAGE) endTenure(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:EndTenureDto){return this.governance.endTenure(societyId,this.user(userId),id,new Date(dto.effectiveTo),dto.handoverNotes);}
  @Get('meetings') @RequiresPermissions(AppPermission.GOVERNANCE_READ) listMeetings(@CurrentTenant() societyId:string){return this.governance.listMeetings(societyId);}
  @Get('meetings/:id') @RequiresPermissions(AppPermission.GOVERNANCE_READ) getMeeting(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string){return this.governance.getMeeting(societyId,id);}
  @Post('meetings') @RequiresPermissions(AppPermission.GOVERNANCE_MANAGE) createMeeting(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:CreateMeetingDto){return this.governance.createMeeting(societyId,this.user(userId),{...dto,scheduledAt:new Date(dto.scheduledAt)});}
  @Post('meetings/:id/outcome') @RequiresPermissions(AppPermission.GOVERNANCE_MANAGE) outcome(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:MeetingOutcomeDto){return this.governance.recordMeetingOutcome(societyId,this.user(userId),id,{...dto,heldAt:dto.heldAt?new Date(dto.heldAt):undefined});}
  @Post('meetings/:id/agenda') @RequiresPermissions(AppPermission.GOVERNANCE_MANAGE) agenda(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:AgendaDto){return this.governance.addAgenda(societyId,this.user(userId),id,dto);}
  @Post('meetings/:id/resolutions') @RequiresPermissions(AppPermission.GOVERNANCE_MANAGE) resolution(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:ResolutionDto){return this.governance.addResolution(societyId,this.user(userId),id,dto);}
  @Post('meetings/:id/actions') @RequiresPermissions(AppPermission.GOVERNANCE_MANAGE) action(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:ActionDto){return this.governance.addAction(societyId,this.user(userId),id,{...dto,dueAt:dto.dueAt?new Date(dto.dueAt):undefined});}
  private user(userId?:string){if(!userId)throw new BadRequestException('Authenticated user is required');return userId;}
}
