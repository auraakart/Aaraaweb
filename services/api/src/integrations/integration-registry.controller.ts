import { BadRequestException, Body, Controller, ExecutionContext, Get, Put, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsBoolean, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { IntegrationConfigurationService } from './integration-configuration.service';
import { IntegrationFamily, IntegrationRegistryService } from './integration-registry.service';

const CurrentUser=createParamDecorator((_data:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<{auth?:{userId?:string}}>().auth?.userId);
class UpdateIntegrationConfigurationDto {
  @IsIn(['OTP','WHATSAPP','PUSH','PAYMENT_GATEWAY','ACCESS_CONTROL','OBJECT_STORAGE','SMART_METER','ACCOUNTING_CONNECTOR']) family!:IntegrationFamily;
  @IsString() @MinLength(1) @MaxLength(80) providerKey!:string;
  @IsBoolean() enabled!:boolean;
}

@Controller('integrations/registry')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class IntegrationRegistryController {
  constructor(private readonly registry: IntegrationRegistryService, private readonly configuration: IntegrationConfigurationService) {}

  @Get()
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_READ)
  list(@CurrentTenant() societyId: string) {
    return this.registry.list(societyId);
  }

  @Get('conformance')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_READ)
  conformance(@CurrentTenant() societyId:string) { return this.registry.conformance(societyId); }

  @Get('configuration')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_READ)
  configurationList(@CurrentTenant() societyId:string) {
    return this.configuration.list(societyId);
  }

  @Get('configuration/events')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_READ)
  configurationEvents(@CurrentTenant() societyId:string) {
    return this.configuration.events(societyId);
  }

  @Put('configuration')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
  updateConfiguration(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:UpdateIntegrationConfigurationDto) {
    if(!userId) throw new BadRequestException('Authenticated user is required');
    return this.configuration.update(societyId,userId,dto);
  }
}
