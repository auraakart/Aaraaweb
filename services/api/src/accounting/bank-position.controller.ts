import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { BankPositionService } from './bank-position.service';

@Controller('accounting/bank-reconciliation')
@UseGuards(BearerGuard,TenantGuard,FeatureGuard,PermissionsGuard)
@RequiresFeature(ProductFeature.SOCIETY_ACCOUNTING)
export class BankPositionController {
  constructor(private readonly positions:BankPositionService) {}
  @Get('accounts/:id/position') @RequiresPermissions(AppPermission.FINANCE_READ)
  position(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string,@Query('asOf') asOf?:string){
    if(!asOf) throw new BadRequestException('asOf is required');
    return this.positions.position(societyId,id,asOf);
  }
}
