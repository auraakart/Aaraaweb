import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { AiOperationsService } from './ai-operations.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);

class ProposeHelpdeskDto {
  @IsUUID() unitId!: string;
  @IsString() @MinLength(3) @MaxLength(120) title!: string;
  @IsString() @MinLength(5) @MaxLength(2000) description!: string;
  @IsOptional() @IsString() @MaxLength(120) category?: string;
  @IsOptional() @IsIn(['LOW','NORMAL','HIGH','URGENT']) priority?: 'LOW'|'NORMAL'|'HIGH'|'URGENT';
}

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

@Controller('ai-operations')
@UseGuards(BearerGuard,TenantGuard,PermissionsGuard)
export class AiOperationsController {
  constructor(private readonly ai:AiOperationsService) {}

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
