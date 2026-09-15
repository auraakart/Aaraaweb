import { Controller, Get, UseGuards } from '@nestjs/common';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { AccountingConnectorDeliveryService } from './accounting-connector-delivery.service';

@Controller('accounting/connector-deliveries')
@UseGuards(BearerGuard,TenantGuard,FeatureGuard,PermissionsGuard)
@RequiresFeature(ProductFeature.SOCIETY_ACCOUNTING)
export class AccountingConnectorDeliveryController{
  constructor(private readonly deliveries:AccountingConnectorDeliveryService){}
  @Get() @RequiresPermissions(AppPermission.FINANCE_READ)
  list(@CurrentTenant() societyId:string){return this.deliveries.list(societyId);}
}
