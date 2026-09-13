import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsArray, IsDateString, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { FinanceOperationsService } from './finance-operations.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);
class CreateExpenseDto{ @IsString() @MinLength(1) @MaxLength(40) expenseNumber!:string; @IsString() @MinLength(1) @MaxLength(160) vendorName!:string; @IsOptional() @IsString() @MaxLength(120) invoiceReference?:string; @IsDateString() expenseDate!:string; @IsOptional() @IsDateString() dueDate?:string; @IsString() @MinLength(1) @MaxLength(500) description!:string; @IsInt() @Min(1) amountPaise!:number; @IsUUID() expenseAccountId!:string; @IsOptional() @IsUUID() fundId?:string; }
class ApproveExpenseDto{ @IsUUID() payableAccountId!:string; }
class PostExpenseDto{ @IsString() @MinLength(1) @MaxLength(60) entryNumber!:string; }
class SettlePayableDto{ @IsInt() @Min(1) amountPaise!:number; @IsDateString() settlementDate!:string; @IsUUID() journalEntryId!:string; @IsString() @MinLength(1) @MaxLength(120) idempotencyKey!:string; @IsOptional() @IsString() @MaxLength(120) reference?:string; }
class BudgetLineDto{ @IsUUID() accountId!:string; @IsOptional() @IsUUID() fundId?:string; @IsInt() @Min(0) amountPaise!:number; @IsOptional() @IsString() @MaxLength(300) notes?:string; }
class CreateBudgetDto{ @IsString() @MinLength(1) @MaxLength(30) code!:string; @IsString() @MinLength(1) @MaxLength(120) name!:string; @IsDateString() startsOn!:string; @IsDateString() endsOn!:string; @IsArray() @ValidateNested({each:true}) @Type(()=>BudgetLineDto) lines!:BudgetLineDto[]; }

@Controller('accounting/finance-operations')
@UseGuards(BearerGuard,TenantGuard,FeatureGuard,PermissionsGuard)
@RequiresFeature(ProductFeature.SOCIETY_ACCOUNTING)
export class FinanceOperationsController{
  constructor(private readonly finance:FinanceOperationsService){}
  @Get('expenses') @RequiresPermissions(AppPermission.FINANCE_READ) listExpenses(@CurrentTenant() societyId:string){return this.finance.listExpenses(societyId);}
  @Post('expenses') @RequiresPermissions(AppPermission.FINANCE_MANAGE) createExpense(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:CreateExpenseDto){return this.finance.createExpense(societyId,this.user(userId),dto);}
  @Post('expenses/:id/approve') @RequiresPermissions(AppPermission.FINANCE_MANAGE) approveExpense(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:ApproveExpenseDto){return this.finance.approveExpense(societyId,this.user(userId),id,dto);}
  @Post('expenses/:id/post') @RequiresPermissions(AppPermission.FINANCE_MANAGE) postExpense(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:PostExpenseDto){return this.finance.postExpense(societyId,this.user(userId),id,dto.entryNumber);}
  @Get('payables') @RequiresPermissions(AppPermission.FINANCE_READ) listPayables(@CurrentTenant() societyId:string){return this.finance.listPayables(societyId);}
  @Post('payables/:id/settle') @RequiresPermissions(AppPermission.FINANCE_MANAGE) settlePayable(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:SettlePayableDto){return this.finance.settlePayable(societyId,this.user(userId),id,dto);}
  @Get('budgets') @RequiresPermissions(AppPermission.FINANCE_READ) listBudgets(@CurrentTenant() societyId:string){return this.finance.listBudgets(societyId);}
  @Post('budgets') @RequiresPermissions(AppPermission.FINANCE_MANAGE) createBudget(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:CreateBudgetDto){return this.finance.createBudget(societyId,this.user(userId),dto);}
  @Post('budgets/:id/approve') @RequiresPermissions(AppPermission.FINANCE_MANAGE) approveBudget(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){return this.finance.approveBudget(societyId,this.user(userId),id);}
  @Post('budgets/:id/lock') @RequiresPermissions(AppPermission.FINANCE_MANAGE) lockBudget(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string){return this.finance.lockBudget(societyId,this.user(userId),id);}
  @Get('budgets/:id/actuals') @RequiresPermissions(AppPermission.FINANCE_READ) budgetVsActual(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string){return this.finance.budgetVsActual(societyId,id);}
  @Get('fund-utilization') @RequiresPermissions(AppPermission.FINANCE_READ) fundUtilization(@CurrentTenant() societyId:string){return this.finance.fundUtilization(societyId);}
  @Get('export') @RequiresPermissions(AppPermission.FINANCE_READ) exportSnapshot(@CurrentTenant() societyId:string){return this.finance.exportSnapshot(societyId);}
  private user(userId?:string){if(!userId)throw new BadRequestException('Authenticated user is required');return userId;}
}
