import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { PaymentExceptionsService } from './payment-exceptions.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);
class ReverseAllocationDto{@IsInt() @Min(1) amountPaise!:number;@IsString() @MinLength(1) @MaxLength(500) reason!:string;@IsString() @MinLength(1) @MaxLength(120) idempotencyKey!:string;}
class RefundDto{@IsInt() @Min(1) amountPaise!:number;@IsString() @MinLength(1) @MaxLength(500) reason!:string;@IsString() @MinLength(1) @MaxLength(120) idempotencyKey!:string;@IsOptional() @IsString() @MaxLength(160) providerReference?:string;}

@Controller('accounting/payment-exceptions')
@UseGuards(BearerGuard,TenantGuard,FeatureGuard,PermissionsGuard)
@RequiresFeature(ProductFeature.SOCIETY_ACCOUNTING)
export class PaymentExceptionsController{
  constructor(private readonly exceptions:PaymentExceptionsService){}
  @Get('payments/:paymentId') @RequiresPermissions(AppPermission.FINANCE_READ)
  snapshot(@CurrentTenant() societyId:string,@Param('paymentId',new ParseUUIDPipe()) paymentId:string){return this.exceptions.paymentSnapshot(societyId,paymentId);}
  @Get('payments/:paymentId/allocation-reversals') @RequiresPermissions(AppPermission.FINANCE_READ)
  reversals(@CurrentTenant() societyId:string,@Param('paymentId',new ParseUUIDPipe()) paymentId:string){return this.exceptions.listAllocationReversals(societyId,paymentId);}
  @Get('payments/:paymentId/refunds') @RequiresPermissions(AppPermission.FINANCE_READ)
  refunds(@CurrentTenant() societyId:string,@Param('paymentId',new ParseUUIDPipe()) paymentId:string){return this.exceptions.listRefunds(societyId,paymentId);}
  @Post('allocations/:allocationId/reverse') @RequiresPermissions(AppPermission.FINANCE_MANAGE)
  reverse(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('allocationId',new ParseUUIDPipe()) allocationId:string,@Body() dto:ReverseAllocationDto){return this.exceptions.reverseAllocation(societyId,this.user(userId),allocationId,dto);}
  @Post('payments/:paymentId/refunds') @RequiresPermissions(AppPermission.FINANCE_MANAGE)
  refund(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('paymentId',new ParseUUIDPipe()) paymentId:string,@Body() dto:RefundDto){return this.exceptions.recordRefund(societyId,this.user(userId),paymentId,dto);}
  private user(id?:string){if(!id)throw new BadRequestException('Authenticated user is required');return id;}
}
