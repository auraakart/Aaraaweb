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
import { PaymentReconciliationObservabilityService } from './payment-reconciliation-observability.service';

@Controller('accounting/payment-reconciliation')
@UseGuards(BearerGuard,TenantGuard,FeatureGuard,PermissionsGuard)
@RequiresFeature(ProductFeature.SOCIETY_ACCOUNTING)
export class PaymentReconciliationObservabilityController{
  constructor(private readonly observability:PaymentReconciliationObservabilityService){}
  @Get('metrics')
  @RequiresPermissions(AppPermission.FINANCE_READ)
  metrics(@CurrentTenant() societyId:string){return this.observability.metrics(societyId);}
}
