import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { AccessDeviceCommandType, AccessDeviceKind } from './access-device.adapter';
import { AccessIntegrationService } from './access-integration.service';

class CommandDto {
  @IsString() @MinLength(8) @MaxLength(160) idempotencyKey!:string;
  @IsIn(['PING','OPEN','CLOSE','READ']) command!:AccessDeviceCommandType;
  @IsOptional() @IsObject() payload?:Record<string,unknown>;
}

class HealthDto {
  @IsIn(['ONLINE','DEGRADED','OFFLINE']) health!:'ONLINE'|'DEGRADED'|'OFFLINE';
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
}
