import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsISO8601, IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { AccessDeviceCommandType, AccessDeviceKind } from './access-device.adapter';
import { AccessIntegrationService } from './access-integration.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);

class CommandDto {
  @IsString() @MinLength(8) @MaxLength(160) idempotencyKey!:string;
  @IsIn(['PING','OPEN','CLOSE','READ']) command!:AccessDeviceCommandType;
  @IsOptional() @IsObject() payload?:Record<string,unknown>;
}

class HealthDto {
  @IsIn(['ONLINE','DEGRADED','OFFLINE']) health!:'ONLINE'|'DEGRADED'|'OFFLINE';
}

class CreateDeviceDto {
  @IsUUID() gateId!:string;
  @IsIn(['ANPR','BOOM_BARRIER','RFID']) adapterKind!:AccessDeviceKind;
  @IsString() @MinLength(1) @MaxLength(160) deviceKey!:string;
  @IsString() @MinLength(1) @MaxLength(160) displayName!:string;
  @IsOptional() @IsObject() config?:Record<string,unknown>;
}

class EventDto {
  @IsString() @MinLength(1) @MaxLength(200) externalEventId!:string;
  @IsString() @MinLength(1) @MaxLength(80) eventType!:string;
  @IsOptional() @IsObject() payload?:Record<string,unknown>;
  @IsISO8601() occurredAt!:string;
}

@Controller('access-integrations')
@UseGuards(BearerGuard,TenantGuard,PermissionsGuard)
export class AccessIntegrationController {
  constructor(private readonly integrations:AccessIntegrationService) {}

  @Get('adapters')
  @RequiresPermissions(AppPermission.GATE_READ)
  adapters(){ return this.integrations.listAdapters(); }

  @Get('adapters/:kind/health')
  @RequiresPermissions(AppPermission.GATE_READ)
  health(@Param('kind') kind:AccessDeviceKind){ return this.integrations.health(kind); }

  @Post('adapters/:kind/commands')
  @RequiresPermissions(AppPermission.GATE_MANAGE)
  command(@Param('kind') kind:AccessDeviceKind,@Body() dto:CommandDto){ return this.integrations.command(kind,dto); }

  @Post('adapters/:kind/simulator-health')
  @RequiresPermissions(AppPermission.GATE_MANAGE)
  simulatorHealth(@Param('kind') kind:AccessDeviceKind,@Body() dto:HealthDto){ return this.integrations.setSimulatorHealth(kind,dto.health); }

  @Get('devices')
  @RequiresPermissions(AppPermission.GATE_READ)
  devices(@CurrentTenant() societyId:string){ return this.integrations.listDevices(societyId); }

  @Post('devices')
  @RequiresPermissions(AppPermission.GATE_MANAGE)
  createDevice(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:CreateDeviceDto){
    return this.integrations.createDevice(societyId,this.user(userId),dto);
  }

  @Post('devices/:id/refresh-health')
  @RequiresPermissions(AppPermission.GATE_MANAGE)
  refreshDeviceHealth(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string){
    return this.integrations.refreshDeviceHealth(societyId,id);
  }

  @Post('devices/:id/commands')
  @RequiresPermissions(AppPermission.GATE_MANAGE)
  deviceCommand(
    @CurrentTenant() societyId:string,
    @CurrentUser() userId:string|undefined,
    @Param('id',new ParseUUIDPipe()) id:string,
    @Body() dto:CommandDto,
  ){
    return this.integrations.commandDevice(societyId,this.user(userId),id,dto);
  }

  @Get('devices/:id/events')
  @RequiresPermissions(AppPermission.GATE_READ)
  events(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string){
    return this.integrations.listEvents(societyId,id);
  }

  @Post('devices/:id/events')
  @RequiresPermissions(AppPermission.GATE_MANAGE)
  ingestEvent(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:EventDto){
    return this.integrations.ingestEvent(societyId,id,dto);
  }

  private user(userId?:string){
    if(!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
