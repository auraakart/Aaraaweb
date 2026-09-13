import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { UnitRelation } from '@prisma/client';
import { IsBoolean, IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { OccupancyLifecycleService } from './occupancy-lifecycle.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);
class MoveInDto{@IsUUID() unitId!:string;@IsUUID() userId!:string;@IsEnum(UnitRelation) relation!:UnitRelation;@IsISO8601() effectiveAt!:string;@IsOptional() @IsString() @MaxLength(500) reason?:string;}
class OwnerMoveInDto{@IsUUID() unitId!:string;@IsUUID() userId!:string;@IsISO8601() effectiveAt!:string;@IsOptional() @IsString() @MaxLength(500) reason?:string;}
class MoveOutDto{@IsUUID() occupancyId!:string;@IsISO8601() effectiveAt!:string;@IsOptional() @IsString() @MaxLength(500) reason?:string;}
class ReviewDto{@IsOptional() @IsString() @MaxLength(500) note?:string;}
class ChecklistDto{@IsBoolean() completed!:boolean;@IsOptional() @IsString() @MaxLength(500) note?:string;}
class DocumentDto{@IsString() @MaxLength(80) kind!:string;@IsString() @MaxLength(500) fileReference!:string;@IsOptional() @IsString() @MaxLength(500) note?:string;}

@Controller('occupancy-lifecycle')
@UseGuards(BearerGuard,TenantGuard,PermissionsGuard)
export class OccupancyLifecycleController{
  constructor(private readonly lifecycle:OccupancyLifecycleService){}
  @Get('self/context') selfContext(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined){return this.lifecycle.selfContext(societyId,this.user(userId));}
  @Get('self') listMine(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined){return this.lifecycle.listMine(societyId,this.user(userId));}
  @Get('self/:id') getMine(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){return this.lifecycle.getMine(societyId,this.user(userId),id);}
  @Get() @RequiresPermissions(AppPermission.OCCUPANCY_LIFECYCLE_READ) list(@CurrentTenant() societyId:string){return this.lifecycle.list(societyId);}
  @Get(':id') @RequiresPermissions(AppPermission.OCCUPANCY_LIFECYCLE_READ) get(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string){return this.lifecycle.get(societyId,id);}
  @Post('move-ins') @RequiresPermissions(AppPermission.OCCUPANCY_LIFECYCLE_MANAGE) moveIn(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:MoveInDto){return this.lifecycle.requestMoveIn(societyId,this.user(userId),{...dto,effectiveAt:this.date(dto.effectiveAt)});}
  @Post('move-outs') @RequiresPermissions(AppPermission.OCCUPANCY_LIFECYCLE_MANAGE) moveOut(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:MoveOutDto){return this.lifecycle.requestMoveOut(societyId,this.user(userId),{...dto,effectiveAt:this.date(dto.effectiveAt)});}
  @Post('self/owner-move-ins') ownerMoveIn(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:OwnerMoveInDto){return this.lifecycle.requestOwnerMoveIn(societyId,this.user(userId),{...dto,relation:UnitRelation.TENANT,effectiveAt:this.date(dto.effectiveAt)});}
  @Post('self/move-outs') myMoveOut(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:MoveOutDto){return this.lifecycle.requestMyMoveOut(societyId,this.user(userId),{...dto,effectiveAt:this.date(dto.effectiveAt)});}
  @Post(':id/approve') @RequiresPermissions(AppPermission.OCCUPANCY_LIFECYCLE_MANAGE) approve(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:ReviewDto){return this.lifecycle.review(societyId,this.user(userId),id,true,dto.note);}
  @Post(':id/reject') @RequiresPermissions(AppPermission.OCCUPANCY_LIFECYCLE_MANAGE) reject(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:ReviewDto){return this.lifecycle.review(societyId,this.user(userId),id,false,dto.note);}
  @Post(':id/checklist/:itemId') @RequiresPermissions(AppPermission.OCCUPANCY_LIFECYCLE_MANAGE) checklist(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Param('itemId',new ParseUUIDPipe()) itemId:string,@Body() dto:ChecklistDto){return this.lifecycle.setChecklistItem(societyId,this.user(userId),id,itemId,dto.completed,dto.note);}
  @Post(':id/documents') @RequiresPermissions(AppPermission.OCCUPANCY_LIFECYCLE_MANAGE) addDocument(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:DocumentDto){return this.lifecycle.addDocument(societyId,this.user(userId),id,dto.kind,dto.fileReference,dto.note);}
  @Post(':id/documents/:documentId/verify') @RequiresPermissions(AppPermission.OCCUPANCY_LIFECYCLE_MANAGE) verifyDocument(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Param('documentId',new ParseUUIDPipe()) documentId:string,@Body() dto:ReviewDto){return this.lifecycle.verifyDocument(societyId,this.user(userId),id,documentId,dto.note);}
  @Post(':id/complete') @RequiresPermissions(AppPermission.OCCUPANCY_LIFECYCLE_MANAGE) complete(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){return this.lifecycle.complete(societyId,this.user(userId),id);}
  private user(userId?:string){if(!userId)throw new BadRequestException('Authenticated user is required');return userId;}
  private date(value:string){const date=new Date(value);if(Number.isNaN(date.getTime()))throw new BadRequestException('Invalid effectiveAt');return date;}
}
