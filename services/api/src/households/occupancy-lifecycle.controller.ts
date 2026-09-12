import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { UnitRelation } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { OccupancyLifecycleService } from './occupancy-lifecycle.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);
class MoveInDto{@IsUUID() unitId!:string;@IsUUID() userId!:string;@IsEnum(UnitRelation) relation!:UnitRelation;@IsISO8601() effectiveAt!:string;@IsOptional() @IsString() @MaxLength(500) reason?:string;}
class MoveOutDto{@IsUUID() occupancyId!:string;@IsISO8601() effectiveAt!:string;@IsOptional() @IsString() @MaxLength(500) reason?:string;}
class ReviewDto{@IsOptional() @IsString() @MaxLength(500) note?:string;}

@Controller('occupancy-lifecycle')
@UseGuards(BearerGuard,TenantGuard,PermissionsGuard)
export class OccupancyLifecycleController{
  constructor(private readonly lifecycle:OccupancyLifecycleService){}
  @Get() @RequiresPermissions(AppPermission.OCCUPANCY_LIFECYCLE_READ) list(@CurrentTenant() societyId:string){return this.lifecycle.list(societyId);}
  @Get(':id') @RequiresPermissions(AppPermission.OCCUPANCY_LIFECYCLE_READ) get(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string){return this.lifecycle.get(societyId,id);}
  @Post('move-ins') @RequiresPermissions(AppPermission.OCCUPANCY_LIFECYCLE_MANAGE) moveIn(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:MoveInDto){return this.lifecycle.requestMoveIn(societyId,this.user(userId),{...dto,effectiveAt:this.date(dto.effectiveAt)});}
  @Post('move-outs') @RequiresPermissions(AppPermission.OCCUPANCY_LIFECYCLE_MANAGE) moveOut(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:MoveOutDto){return this.lifecycle.requestMoveOut(societyId,this.user(userId),{...dto,effectiveAt:this.date(dto.effectiveAt)});}
  @Post(':id/approve') @RequiresPermissions(AppPermission.OCCUPANCY_LIFECYCLE_MANAGE) approve(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:ReviewDto){return this.lifecycle.review(societyId,this.user(userId),id,true,dto.note);}
  @Post(':id/reject') @RequiresPermissions(AppPermission.OCCUPANCY_LIFECYCLE_MANAGE) reject(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:ReviewDto){return this.lifecycle.review(societyId,this.user(userId),id,false,dto.note);}
  @Post(':id/complete') @RequiresPermissions(AppPermission.OCCUPANCY_LIFECYCLE_MANAGE) complete(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){return this.lifecycle.complete(societyId,this.user(userId),id);}
  private user(userId?:string){if(!userId)throw new BadRequestException('Authenticated user is required');return userId;}
  private date(value:string){const date=new Date(value);if(Number.isNaN(date.getTime()))throw new BadRequestException('Invalid effectiveAt');return date;}
}
