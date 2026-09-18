import { Body, Controller, ExecutionContext, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsIn, IsInt, Min } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { OperationalUsageEventType, OperationalUsageService } from './operational-usage.service';

const CurrentPrincipal=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth);

class GuardSyncDto {
  @IsInt() @Min(0) considered!:number;
  @IsInt() @Min(0) synced!:number;
  @IsInt() @Min(0) retried!:number;
  @IsInt() @Min(0) unresolved!:number;
  @IsInt() @Min(0) reviewRequired!:number;
}

class UsageEventDto {
  @IsIn(['PROPERTY_CONTEXT_SWITCHED','SERVICE_DISCOVERY_VIEWED'])
  eventType!:OperationalUsageEventType;
}

@Controller('analytics')
@UseGuards(BearerGuard)
export class OperationalUsageController {
  constructor(private readonly usage:OperationalUsageService) {}

  @Post('guard-sync')
  @UseGuards(TenantGuard,PermissionsGuard)
  @RequiresPermissions(AppPermission.GATE_ACCESS_PROCESS)
  async guardSync(@CurrentPrincipal() auth:AuthenticatedRequest['auth'],@Body() dto:GuardSyncDto){
    if(!auth?.societyId) return {recorded:false};
    await this.usage.recordGuardSync(auth.societyId,dto);
    return {recorded:true};
  }

  @Post('usage')
  async record(@CurrentPrincipal() auth:AuthenticatedRequest['auth'],@Body() dto:UsageEventDto){
    if(!auth?.userId) return {recorded:false};
    await this.usage.record(auth.userId,auth.societyId,dto.eventType);
    return {recorded:true};
  }
}
