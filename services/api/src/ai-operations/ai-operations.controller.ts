import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, Req, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { AppRole } from '../auth/auth.types';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { AiAssistantService } from './ai-assistant.service';
import { AiOperationsService } from './ai-operations.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);

class ProposeHelpdeskDto {
  @IsUUID() unitId!: string;
  @IsString() @MinLength(3) @MaxLength(120) title!: string;
  @IsString() @MinLength(5) @MaxLength(2000) description!: string;
  @IsOptional() @IsString() @MaxLength(120) category?: string;
  @IsOptional() @IsIn(['LOW','NORMAL','HIGH','URGENT']) priority?: 'LOW'|'NORMAL'|'HIGH'|'URGENT';
}

class ProposeHelpdeskAssignmentDto { @IsUUID() ticketId!:string; @IsOptional() @IsUUID() assignedToId?:string|null; }

class ProposeAmenityBookingDto {
  @IsUUID() amenityId!: string;
  @IsUUID() unitId!: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
}

class ProposeVisitorPassDto {
  @IsUUID() unitId!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsString() @MinLength(5) @MaxLength(30) phone!: string;
  @IsDateString() validFrom!: string;
  @IsDateString() validUntil!: string;
}

class AssistantQueryDto {
  @IsString() @MinLength(2) @MaxLength(1000) message!: string;
  @IsOptional() @IsUUID() unitId?: string;
}

class HelpdeskFromTextDto {
  @IsUUID() unitId!: string;
  @IsString() @MinLength(5) @MaxLength(2000) text!: string;
}

class NoticeDraftDto {
  @IsString() @MinLength(3) @MaxLength(500) topic!: string;
  @IsIn(['en-IN','hi-IN','ta-IN']) language!: 'en-IN'|'hi-IN'|'ta-IN';
  @IsOptional() @IsString() @MaxLength(120) audience?: string;
}

@Controller('ai-operations')
@UseGuards(BearerGuard,TenantGuard,FeatureGuard,PermissionsGuard)
@RequiresFeature(ProductFeature.AI_ASSISTANT)
export class AiOperationsController {
  constructor(private readonly ai:AiOperationsService,private readonly assistant:AiAssistantService) {}

  @Get('assistant/tools')
  assistantTools(@Req() request:AuthenticatedRequest){
    return this.assistant.tools((request.auth?.roles??[]) as AppRole[]);
  }

  @Get('assistant/action-centre')
  actionCentre(@CurrentTenant() societyId:string,@Req() request:AuthenticatedRequest){
    return this.assistant.actionCentre(societyId,(request.auth?.roles??[]) as AppRole[]);
  }

  @Post('assistant/query')
  assistantQuery(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Req() request:AuthenticatedRequest,@Body() dto:AssistantQueryDto){
    return this.assistant.query(societyId,this.user(userId),(request.auth?.roles??[]) as AppRole[],dto.message,dto.unitId);
  }

  @Post('assistant/helpdesk-from-text')
  @RequiresPermissions(AppPermission.HELPDESK_MANAGE_OWN)
  helpdeskFromText(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:HelpdeskFromTextDto){
    return this.assistant.proposeHelpdeskFromText(societyId,this.user(userId),dto.unitId,dto.text);
  }

  @Post('assistant/notice-draft')
  @RequiresPermissions(AppPermission.NOTICE_MANAGE)
  noticeDraft(@Body() dto:NoticeDraftDto){
    return this.assistant.noticeDraft(dto.topic,dto.language,dto.audience);
  }

  @Get('assistant/audit')
  @RequiresPermissions(AppPermission.AUDIT_READ)
  audit(@CurrentTenant() societyId:string,@Query('page',new ParseIntPipe({optional:true})) page?:number,@Query('pageSize',new ParseIntPipe({optional:true})) pageSize?:number){
    return this.assistant.audit(societyId,page??1,pageSize??50);
  }

  @Get('summary')
  @RequiresPermissions(AppPermission.HELPDESK_READ_OWN)
  summary(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined){
    return this.ai.summary(societyId,this.user(userId));
  }

  @Get('finance-summary')
  @RequiresPermissions(AppPermission.PROPERTY_FINANCE_READ)
  financeSummary(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined){
    return this.ai.financeSummary(societyId,this.user(userId));
  }

  @Get('operations-summary')
  @RequiresPermissions(AppPermission.HELPDESK_REVIEW)
  operationsSummary(@CurrentTenant() societyId:string){
    return this.ai.operationsSummary(societyId);
  }

  @Get('overdue-finance-summary')
  @RequiresPermissions(AppPermission.FINANCE_READ)
  overdueFinanceSummary(@CurrentTenant() societyId:string){
    return this.ai.overdueFinanceSummary(societyId);
  }

  @Post('proposals/helpdesk')
  @RequiresPermissions(AppPermission.HELPDESK_MANAGE_OWN)
  proposeHelpdesk(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:ProposeHelpdeskDto){
    return this.ai.proposeHelpdesk(societyId,this.user(userId),dto);
  }

  @Post('proposals/helpdesk-assignment')
  @RequiresPermissions(AppPermission.HELPDESK_REVIEW)
  proposeHelpdeskAssignment(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:ProposeHelpdeskAssignmentDto){return this.ai.proposeHelpdeskAssignment(societyId,this.user(userId),{ticketId:dto.ticketId,assignedToId:dto.assignedToId??null});}

  @Post('proposals/:id/confirm-helpdesk-assignment')
  @RequiresPermissions(AppPermission.HELPDESK_REVIEW)
  confirmHelpdeskAssignment(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){return this.ai.confirmHelpdeskAssignment(societyId,this.user(userId),id);}

  @Post('proposals/:id/cancel-helpdesk-assignment')
  @RequiresPermissions(AppPermission.HELPDESK_REVIEW)
  cancelHelpdeskAssignment(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){return this.ai.cancelHelpdeskAssignment(societyId,this.user(userId),id);}

  @Post('proposals/amenity-booking')
  @RequiresPermissions(AppPermission.AMENITY_BOOK_OWN)
  proposeAmenityBooking(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:ProposeAmenityBookingDto){
    return this.ai.proposeAmenityBooking(societyId,this.user(userId),dto);
  }

  @Post('proposals/visitor-pass')
  @RequiresPermissions(AppPermission.VISITOR_MANAGE_OWN)
  proposeVisitorPass(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:ProposeVisitorPassDto){
    return this.ai.proposeVisitorPass(societyId,this.user(userId),dto);
  }

  @Post('proposals/:id/confirm')
  @RequiresPermissions(AppPermission.HELPDESK_MANAGE_OWN)
  confirm(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){
    return this.ai.confirm(societyId,this.user(userId),id);
  }

  @Post('proposals/:id/confirm-amenity')
  @RequiresPermissions(AppPermission.AMENITY_BOOK_OWN)
  confirmAmenity(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){
    return this.ai.confirmAmenity(societyId,this.user(userId),id);
  }

  @Post('proposals/:id/confirm-visitor')
  @RequiresPermissions(AppPermission.VISITOR_MANAGE_OWN)
  confirmVisitor(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){
    return this.ai.confirmVisitor(societyId,this.user(userId),id);
  }

  @Post('proposals/:id/cancel')
  @RequiresPermissions(AppPermission.HELPDESK_MANAGE_OWN)
  cancel(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){
    return this.ai.cancel(societyId,this.user(userId),id);
  }

  @Post('proposals/:id/cancel-amenity')
  @RequiresPermissions(AppPermission.AMENITY_BOOK_OWN)
  cancelAmenity(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){
    return this.ai.cancelAmenity(societyId,this.user(userId),id);
  }

  @Post('proposals/:id/cancel-visitor')
  @RequiresPermissions(AppPermission.VISITOR_MANAGE_OWN)
  cancelVisitor(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){
    return this.ai.cancelVisitor(societyId,this.user(userId),id);
  }

  private user(userId?:string){
    if(!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
