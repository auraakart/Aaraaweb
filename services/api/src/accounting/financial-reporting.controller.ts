import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { BearerGuard } from '../auth/bearer.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { FinancialReportingService } from './financial-reporting.service';

@Controller('accounting/reports')
@UseGuards(BearerGuard,TenantGuard,FeatureGuard,PermissionsGuard)
@RequiresFeature(ProductFeature.SOCIETY_ACCOUNTING)
export class FinancialReportingController {
  constructor(private readonly reports:FinancialReportingService) {}

  @Get('trial-balance') @RequiresPermissions(AppPermission.FINANCE_READ)
  trialBalance(@CurrentTenant() societyId:string,@Query('asOf') asOf?:string){return this.reports.trialBalance(societyId,this.date(asOf,'asOf'));}

  @Get('income-expense') @RequiresPermissions(AppPermission.FINANCE_READ)
  incomeExpense(@CurrentTenant() societyId:string,@Query('from') from?:string,@Query('to') to?:string){const range=this.range(from,to);return this.reports.incomeExpense(societyId,range.from,range.to);}

  @Get('balance-sheet') @RequiresPermissions(AppPermission.FINANCE_READ)
  balanceSheet(@CurrentTenant() societyId:string,@Query('asOf') asOf?:string){return this.reports.balanceSheet(societyId,this.date(asOf,'asOf'));}

  @Get('defaulters') @RequiresPermissions(AppPermission.FINANCE_READ)
  defaulters(@CurrentTenant() societyId:string,@Query('asOf') asOf?:string){return this.reports.defaulters(societyId,this.date(asOf,'asOf'));}

  @Get('fund-statement') @RequiresPermissions(AppPermission.FINANCE_READ)
  fundStatement(@CurrentTenant() societyId:string,@Query('from') from?:string,@Query('to') to?:string){const range=this.range(from,to);return this.reports.fundStatement(societyId,range.from,range.to);}

  private range(from?:string,to?:string){const start=this.date(from,'from');const end=this.date(to,'to');if(start>end)throw new BadRequestException('Report start must be on or before end');return {from:start,to:end};}
  private date(value:string|undefined,label:string){if(!value||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)||Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)))throw new BadRequestException(`${label} must be a valid YYYY-MM-DD date`);return value;}
}
