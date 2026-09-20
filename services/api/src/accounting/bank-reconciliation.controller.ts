import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, Query, UseGuards, createParamDecorator } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
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
import { BankReconciliationService } from './bank-reconciliation.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);
class CreateBankAccountDto {
  @IsString() @MinLength(1) @MaxLength(30) code!:string;
  @IsString() @MinLength(1) @MaxLength(120) bankName!:string;
  @IsString() @MinLength(1) @MaxLength(120) accountName!:string;
  @IsString() @MinLength(1) @MaxLength(40) maskedAccountNumber!:string;
  @IsOptional() @IsString() @MaxLength(20) ifsc?:string;
  @IsUUID() ledgerAccountId!:string;
  @IsOptional() @IsInt() @Min(0) openingBalancePaise?:number;
}
class ImportBankTransactionDto {
  @IsUUID() bankAccountId!:string;
  @IsString() @MinLength(1) @MaxLength(160) externalKey!:string;
  @IsDateString() transactionDate!:string;
  @IsOptional() @IsDateString() valueDate?:string;
  @IsIn(['CREDIT','DEBIT']) direction!:'CREDIT'|'DEBIT';
  @IsInt() @Min(1) amountPaise!:number;
  @IsOptional() @IsString() @MaxLength(160) reference?:string;
  @IsOptional() @IsString() @MaxLength(500) description?:string;
}
class BankStatementPreviewRowDto {
  @IsString() @MinLength(1) @MaxLength(160) externalKey!:string;
  @IsDateString() transactionDate!:string;
  @IsOptional() @IsDateString() valueDate?:string;
  @IsIn(['CREDIT','DEBIT']) direction!:'CREDIT'|'DEBIT';
  @IsInt() @Min(1) amountPaise!:number;
  @IsOptional() @IsString() @MaxLength(160) reference?:string;
  @IsOptional() @IsString() @MaxLength(500) description?:string;
}
class BankStatementPreviewDto {
  @IsUUID() bankAccountId!:string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({each:true}) @Type(()=>BankStatementPreviewRowDto)
  rows!:BankStatementPreviewRowDto[];
}
class MatchBankTransactionDto {
  @IsUUID() journalEntryId!:string;
  @IsOptional() @IsString() @MaxLength(500) note?:string;
}

@Controller('accounting/bank-reconciliation')
@UseGuards(BearerGuard,TenantGuard,FeatureGuard,PermissionsGuard)
@RequiresFeature(ProductFeature.SOCIETY_ACCOUNTING)
export class BankReconciliationController {
  constructor(private readonly bank:BankReconciliationService) {}

  @Get('accounts') @RequiresPermissions(AppPermission.FINANCE_READ)
  listAccounts(@CurrentTenant() societyId:string){return this.bank.listAccounts(societyId);}

  @Post('accounts') @RequiresPermissions(AppPermission.FINANCE_MANAGE)
  createAccount(@CurrentTenant() societyId:string,@Body() dto:CreateBankAccountDto){return this.bank.createAccount(societyId,dto);}

  @Get('transactions') @RequiresPermissions(AppPermission.FINANCE_READ)
  listTransactions(@CurrentTenant() societyId:string,@Query('bankAccountId') bankAccountId?:string,@Query('status') status?:string){return this.bank.listTransactions(societyId,bankAccountId,status);}

  @Post('transactions/import/preview') @RequiresPermissions(AppPermission.FINANCE_MANAGE)
  previewImport(@CurrentTenant() societyId:string,@Body() dto:BankStatementPreviewDto){return this.bank.previewImport(societyId,dto.bankAccountId,dto.rows);}

  @Post('transactions/import') @RequiresPermissions(AppPermission.FINANCE_MANAGE)
  importTransaction(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:ImportBankTransactionDto){return this.bank.importTransaction(societyId,this.user(userId),dto);}

  @Post('transactions/:id/match') @RequiresPermissions(AppPermission.FINANCE_MANAGE)
  match(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:MatchBankTransactionDto){return this.bank.match(societyId,this.user(userId),id,dto);}

  @Post('transactions/:id/unmatch') @RequiresPermissions(AppPermission.FINANCE_MANAGE)
  unmatch(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string){return this.bank.unmatch(societyId,id);}

  @Post('transactions/:id/ignore') @RequiresPermissions(AppPermission.FINANCE_MANAGE)
  ignore(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string){return this.bank.ignore(societyId,id);}

  @Get('summary') @RequiresPermissions(AppPermission.FINANCE_READ)
  summary(@CurrentTenant() societyId:string,@Query('bankAccountId') bankAccountId?:string){return this.bank.summary(societyId,bankAccountId);}

  @Get('review') @RequiresPermissions(AppPermission.FINANCE_READ)
  review(@CurrentTenant() societyId:string,@Query('bankAccountId') bankAccountId?:string){return this.bank.review(societyId,bankAccountId);}

  @Get('transactions/:id/suggestions') @RequiresPermissions(AppPermission.FINANCE_READ)
  suggestions(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string){return this.bank.suggestions(societyId,id);}

  private user(userId?:string){if(!userId) throw new BadRequestException('Authenticated user is required');return userId;}
}
