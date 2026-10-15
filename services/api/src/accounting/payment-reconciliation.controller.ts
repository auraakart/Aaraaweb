import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { PaymentReconciliationService } from './payment-reconciliation.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);
class OpenCaseDto{@IsString() @MinLength(1) @MaxLength(80) provider!:string;}
class ObservationDto{@IsOptional() @IsString() @MaxLength(160) providerPaymentId?:string;@IsString() @MinLength(1) @MaxLength(80) observedProviderStatus!:string;@IsInt() @Min(0) observedAmountPaise!:number;}
class ResolveCaseDto{@IsString() @MinLength(1) @MaxLength(500) reason!:string;}
class CreateOperationDto{@IsIn(['STATUS_QUERY','REFUND']) operationType!:'STATUS_QUERY'|'REFUND';@IsString() @MinLength(1) @MaxLength(80) provider!:string;@IsOptional() @IsInt() @Min(1) amountPaise?:number;@IsString() @MinLength(1) @MaxLength(120) idempotencyKey!:string;}
class OperationResultDto{@IsIn(['ACCEPTED','SETTLED','FAILED','UNKNOWN']) status!:'ACCEPTED'|'SETTLED'|'FAILED'|'UNKNOWN';@IsOptional() @IsString() @MaxLength(160) providerOperationId?:string;@IsOptional() @IsString() @MaxLength(80) failureCode?:string;@IsOptional() @IsString() @MaxLength(500) failureMessage?:string;}

@Controller('accounting/payment-reconciliation')
@UseGuards(BearerGuard,TenantGuard,FeatureGuard,PermissionsGuard)
@RequiresFeature(ProductFeature.SOCIETY_ACCOUNTING)
export class PaymentReconciliationController{
  constructor(private readonly reconciliation:PaymentReconciliationService){}
  @Get('cases') @RequiresPermissions(AppPermission.FINANCE_READ) listCases(@CurrentTenant() societyId:string){return this.reconciliation.listCases(societyId);}
  @Get('cases/:id') @RequiresPermissions(AppPermission.FINANCE_READ) getCase(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string){return this.reconciliation.getCase(societyId,id);}
  @Post('payments/:paymentId/cases') @RequiresPermissions(AppPermission.FINANCE_MANAGE) openCase(@CurrentTenant() societyId:string,@Param('paymentId',new ParseUUIDPipe()) paymentId:string,@Body() dto:OpenCaseDto){return this.reconciliation.openOrRefreshCase(societyId,paymentId,dto.provider);}
  @Post('cases/:id/observe') @RequiresPermissions(AppPermission.FINANCE_MANAGE) observe(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:ObservationDto){return this.reconciliation.recordObservation(societyId,id,dto);}
  @Post('cases/:id/resolve') @RequiresPermissions(AppPermission.FINANCE_MANAGE) resolve(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:ResolveCaseDto){return this.reconciliation.resolveCase(societyId,this.user(userId),id,dto.reason);}
  @Get('payments/:paymentId/operations') @RequiresPermissions(AppPermission.FINANCE_READ) listOperations(@CurrentTenant() societyId:string,@Param('paymentId',new ParseUUIDPipe()) paymentId:string){return this.reconciliation.listOperations(societyId,paymentId);}
  @Post('payments/:paymentId/operations') @RequiresPermissions(AppPermission.FINANCE_MANAGE) createOperation(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('paymentId',new ParseUUIDPipe()) paymentId:string,@Body() dto:CreateOperationDto){return this.reconciliation.createOperation(societyId,this.user(userId),paymentId,dto);}
  @Post('operations/:id/result') @RequiresPermissions(AppPermission.FINANCE_MANAGE) recordResult(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:OperationResultDto){return this.reconciliation.recordOperationResult(societyId,id,dto);}
  private user(userId?:string){if(!userId)throw new BadRequestException('Authenticated user is required');return userId;}
}
