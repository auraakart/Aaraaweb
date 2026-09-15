import { BadRequestException, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { AccountingConnectorDeliveryService } from './accounting-connector-delivery.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);

@Controller('accounting/connector-deliveries')
@UseGuards(BearerGuard,TenantGuard,FeatureGuard,PermissionsGuard)
@RequiresFeature(ProductFeature.SOCIETY_ACCOUNTING)
export class AccountingConnectorDeliveryController{
  constructor(private readonly deliveries:AccountingConnectorDeliveryService){}
  @Get() @RequiresPermissions(AppPermission.FINANCE_READ)
  list(@CurrentTenant() societyId:string){return this.deliveries.list(societyId);}
  @Get('metrics') @RequiresPermissions(AppPermission.FINANCE_READ)
  metrics(@CurrentTenant() societyId:string){return this.deliveries.metrics(societyId);}
  @Post(':id/retry') @RequiresPermissions(AppPermission.FINANCE_MANAGE)
  retry(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){return this.deliveries.retry(societyId,this.user(userId),id);}
  private user(userId?:string){if(!userId)throw new BadRequestException('Authenticated user is required');return userId;}
}
