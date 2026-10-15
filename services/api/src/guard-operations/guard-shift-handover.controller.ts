import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsArray, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { GuardShiftHandoverService } from './guard-shift-handover.service';

const CurrentUser=createParamDecorator((_data:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);

class CreateShiftHandoverDto {
  @IsOptional() @IsUUID() gateId?:string;
  @IsString() @MinLength(3) @MaxLength(2000) summary!:string;
  @IsOptional() @IsArray() @IsString({each:true}) openItems?:string[];
}

@Controller('guard-operations/shift-handovers')
@UseGuards(BearerGuard,TenantGuard,PermissionsGuard)
export class GuardShiftHandoverController {
  constructor(private readonly handovers:GuardShiftHandoverService) {}

  @Get('command-summary')
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  commandSummary(@CurrentTenant() societyId:string){return this.handovers.commandSummary(societyId);}

  @Get()
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  list(@CurrentTenant() societyId:string){return this.handovers.list(societyId);}

  @Post()
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  create(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() body:CreateShiftHandoverDto){
    return this.handovers.create(societyId,this.user(userId),body);
  }

  @Post(':id/acknowledge')
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  acknowledge(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){
    return this.handovers.acknowledge(societyId,this.user(userId),id);
  }

  private user(userId?:string){if(!userId)throw new BadRequestException('Authenticated guard is required');return userId;}
}
