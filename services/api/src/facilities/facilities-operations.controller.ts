import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { FacilitiesOperationsService, FacilityOperationsCategory, FacilityOperationsStatus } from './facilities-operations.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);

class CreateOperationsTaskDto {
  @IsIn(['HOUSEKEEPING','STAFF']) category!: FacilityOperationsCategory;
  @IsString() @MinLength(1) @MaxLength(240) title!: string;
  @IsOptional() @IsString() @MaxLength(240) location?: string;
  @IsOptional() @IsISO8601() scheduledAt?: string;
  @IsOptional() @IsISO8601() dueAt?: string;
  @IsOptional() @IsUUID() assignedUserId?: string;
}

class OperationsTaskStatusDto {
  @IsIn(['IN_PROGRESS','COMPLETED','CANCELLED']) status!: Exclude<FacilityOperationsStatus,'OPEN'>;
  @ValidateIf((o:OperationsTaskStatusDto)=>o.status==='COMPLETED'||o.completionNote!==undefined)
  @IsString() @MinLength(5) @MaxLength(5000) completionNote?: string;
}

@Controller('facilities/operations')
@UseGuards(BearerGuard,TenantGuard,PermissionsGuard)
export class FacilitiesOperationsController {
  constructor(private readonly operations: FacilitiesOperationsService) {}

  @Get()
  @RequiresPermissions(AppPermission.FACILITIES_READ)
  list(@CurrentTenant() societyId:string){
    return this.operations.listTasks(societyId);
  }

  @Post()
  @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  create(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:CreateOperationsTaskDto){
    return this.operations.createTask(societyId,this.user(userId),dto);
  }

  @Get(':id/events')
  @RequiresPermissions(AppPermission.FACILITIES_READ)
  events(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string){
    return this.operations.listEvents(societyId,id);
  }

  @Post(':id/status')
  @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  status(
    @CurrentTenant() societyId:string,
    @CurrentUser() userId:string|undefined,
    @Param('id',new ParseUUIDPipe()) id:string,
    @Body() dto:OperationsTaskStatusDto,
  ){
    return this.operations.setStatus(societyId,this.user(userId),id,dto.status,dto.completionNote);
  }

  private user(userId?:string){
    if(!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
