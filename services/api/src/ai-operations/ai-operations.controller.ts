import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
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

  @Post('proposals/helpdesk')
  @RequiresPermissions(AppPermission.HELPDESK_MANAGE_OWN)
  proposeHelpdesk(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:ProposeHelpdeskDto){
    return this.ai.proposeHelpdesk(societyId,this.user(userId),dto);
  }

  @Post('proposals/:id/confirm')
  @RequiresPermissions(AppPermission.HELPDESK_MANAGE_OWN)
  confirm(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){
    return this.ai.confirm(societyId,this.user(userId),id);
  }

  @Post('proposals/:id/cancel')
  @RequiresPermissions(AppPermission.HELPDESK_MANAGE_OWN)
  cancel(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){
    return this.ai.cancel(societyId,this.user(userId),id);
  }

  private user(userId?:string){
    if(!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
