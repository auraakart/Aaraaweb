import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsISO8601, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { CommunityEventsService } from './community-events.service';

const CurrentUser=createParamDecorator((_data:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);

class CreateCommunityEventDto{
  @IsString() @MaxLength(160) title!:string;
  @IsOptional() @IsString() @MaxLength(3000) description?:string;
  @IsIn(['COMMUNITY','OWNER_ONLY']) audienceScope!:'COMMUNITY'|'OWNER_ONLY';
  @IsISO8601() startsAt!:string;
  @IsISO8601() endsAt!:string;
  @IsOptional() @IsString() @MaxLength(240) location?:string;
  @IsOptional() @IsInt() @Min(1) @Max(10000) capacity?:number|null;
}

class CommunityEventStatusDto{
  @IsIn(['PUBLISHED','CANCELLED']) status!:'PUBLISHED'|'CANCELLED';
}

class CommunityEventRsvpDto{
  @IsIn(['GOING','NOT_GOING']) status!:'GOING'|'NOT_GOING';
}

@Controller('community-events')
@UseGuards(BearerGuard,TenantGuard,FeatureGuard,PermissionsGuard)
@RequiresFeature(ProductFeature.NOTICES)
export class CommunityEventsController{
  constructor(private readonly events:CommunityEventsService){}

  @Get()
  @RequiresPermissions(AppPermission.NOTICE_READ)
  list(@CurrentTenant() societyId:string,@CurrentUser() userId?:string){
    return this.events.listVisible(societyId,this.user(userId));
  }

  @Get('manage')
  @RequiresPermissions(AppPermission.NOTICE_MANAGE)
  manage(@CurrentTenant() societyId:string){
    return this.events.listManage(societyId);
  }

  @Post()
  @RequiresPermissions(AppPermission.NOTICE_MANAGE)
  create(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:CreateCommunityEventDto){
    return this.events.create(societyId,this.user(userId),{
      title:dto.title,description:dto.description,audienceScope:dto.audienceScope,
      startsAt:new Date(dto.startsAt),endsAt:new Date(dto.endsAt),location:dto.location,capacity:dto.capacity,
    });
  }

  @Post(':id/status')
  @RequiresPermissions(AppPermission.NOTICE_MANAGE)
  setStatus(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:CommunityEventStatusDto){
    return this.events.setStatus(societyId,id,dto.status);
  }

  @Post(':id/rsvp')
  @RequiresPermissions(AppPermission.NOTICE_READ)
  rsvp(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:CommunityEventRsvpDto){
    return this.events.rsvp(societyId,this.user(userId),id,dto.status);
  }

  private user(userId?:string){
    if(!userId)throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
