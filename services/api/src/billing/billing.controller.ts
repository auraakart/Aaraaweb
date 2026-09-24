import { BadRequestException, Body, Controller, ExecutionContext, Get, Headers, Param, ParseUUIDPipe, Post, Query, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { BillingService } from './billing.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class CreateInvoiceDto {
  @IsUUID() unitId!: string;
  @IsString() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) billingPeriod!: string;
  @IsInt() @Min(100) @Max(100000000) amountPaise!: number;
  @IsDateString() dueDate!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

class CreatePaymentDto {
  @IsUUID() invoiceId!: string;
  @IsString() @MinLength(8) @MaxLength(100) idempotencyKey!: string;
}

class AutopayPreferenceDto {
  @IsUUID() unitId!: string;
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsInt() @Min(100) @Max(100000000) maxAmountPaise?: number;
  @IsInt() @Min(0) @Max(10) debitDaysBefore!: number;
}

class PaymentWebhookDto {
  @IsString() @MinLength(1) eventId!: string;
  @IsString() @MinLength(1) providerOrderId!: string;
  @IsString() @MinLength(1) providerPaymentId!: string;
  @IsString() @Matches(/^(CAPTURED|FAILED|REFUNDED)$/) status!: 'CAPTURED' | 'FAILED' | 'REFUNDED';
}

@Controller('billing')
@UseGuards(BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('invoices/mine')
  @RequiresFeature(ProductFeature.MAINTENANCE_BILLING)
  @RequiresPermissions(AppPermission.PROPERTY_FINANCE_READ)
  mine(@CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.billing.listMine(societyId, this.requireUser(userId));
  }

  @Get('invoices/payable')
  @RequiresFeature(ProductFeature.MAINTENANCE_BILLING)
  @RequiresPermissions(AppPermission.PAYMENT_CREATE_OWN)
  payable(@CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.billing.listPayable(societyId, this.requireUser(userId));
  }

  @Get('resident-summary')
  @RequiresFeature(ProductFeature.MAINTENANCE_BILLING)
  @RequiresPermissions(AppPermission.PAYMENT_CREATE_OWN)
  residentSummary(
    @CurrentTenant() societyId:string,
    @CurrentUser() userId:string|undefined,
    @Query('unitId') unitId?:string,
  ){
    if(unitId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(unitId)){
      throw new BadRequestException('unitId must be a UUID');
    }
    return this.billing.residentSummary(societyId,this.requireUser(userId),unitId);
  }

  @Get('autopay-preference')
  @RequiresFeature(ProductFeature.PAYMENTS)
  @RequiresPermissions(AppPermission.PAYMENT_CREATE_OWN)
  autopayPreference(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Query('unitId') unitId?:string){
    if(!unitId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(unitId)) throw new BadRequestException('unitId must be a UUID');
    return this.billing.getAutopayPreference(societyId,this.requireUser(userId),unitId);
  }

  @Post('autopay-preference')
  @RequiresFeature(ProductFeature.PAYMENTS)
  @RequiresPermissions(AppPermission.PAYMENT_CREATE_OWN)
  saveAutopayPreference(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:AutopayPreferenceDto){
    return this.billing.setAutopayPreference(societyId,this.requireUser(userId),dto);
  }

  @Get('invoices/admin')
  @RequiresFeature(ProductFeature.MAINTENANCE_BILLING)
  @RequiresPermissions(AppPermission.BILLING_MANAGE)
  admin(@CurrentTenant() societyId: string) { return this.billing.listForSociety(societyId); }

  @Get('invoices/admin/units')
  @RequiresFeature(ProductFeature.MAINTENANCE_BILLING)
  @RequiresPermissions(AppPermission.BILLING_MANAGE)
  units(@CurrentTenant() societyId: string) { return this.billing.listBillableUnits(societyId); }

  @Post('invoices/admin')
  @RequiresFeature(ProductFeature.MAINTENANCE_BILLING)
  @RequiresPermissions(AppPermission.BILLING_MANAGE)
  issue(@Body() dto: CreateInvoiceDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.billing.issue(societyId, this.requireUser(userId), dto);
  }

  @Post('payments')
  @RequiresFeature(ProductFeature.PAYMENTS)
  @RequiresPermissions(AppPermission.PAYMENT_CREATE_OWN)
  pay(@Body() dto: CreatePaymentDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.billing.createPayment(societyId, this.requireUser(userId), dto.invoiceId, dto.idempotencyKey);
  }

  @Get('payments/mine')
  @RequiresFeature(ProductFeature.PAYMENTS)
  @RequiresPermissions(AppPermission.PAYMENT_CREATE_OWN)
  paymentsMine(@CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.billing.listPaymentsMine(societyId, this.requireUser(userId));
  }

  @Get('payments/:paymentId/receipt')
  @RequiresFeature(ProductFeature.PAYMENTS)
  @RequiresPermissions(AppPermission.PAYMENT_CREATE_OWN)
  receipt(@Param('paymentId', new ParseUUIDPipe()) paymentId: string, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.billing.getReceipt(societyId, this.requireUser(userId), paymentId);
  }

  @Get('payments/admin/audit')
  @RequiresFeature(ProductFeature.PAYMENTS)
  @RequiresPermissions(AppPermission.BILLING_MANAGE)
  paymentAudit(@CurrentTenant() societyId: string) {
    return this.billing.listPaymentAudit(societyId);
  }

  @Get('payments/admin/webhook-receipts')
  @RequiresFeature(ProductFeature.PAYMENTS)
  @RequiresPermissions(AppPermission.PAYMENT_RECONCILE)
  webhookReceipts(@CurrentTenant() societyId: string) {
    return this.billing.listWebhookReceipts(societyId);
  }

  @Post('payments/admin/webhook-receipts/:receiptId/replay')
  @RequiresFeature(ProductFeature.PAYMENTS)
  @RequiresPermissions(AppPermission.PAYMENT_RECONCILE)
  replayWebhook(
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string | undefined,
    @Param('receiptId', new ParseUUIDPipe()) receiptId: string,
  ) {
    return this.billing.replayWebhookReceipt(societyId, this.requireUser(userId), receiptId);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}

// Gateway callbacks cannot carry a user bearer token. Authentication is the
// provider HMAC; tenant context is resolved from the globally unique order id.
@Controller('billing/payment-webhooks')
export class PaymentWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Post('gateway-adapter')
  webhook(@Headers('x-aaraagate-signature') signature: string | undefined, @Body() dto: PaymentWebhookDto) {
    return this.billing.reconcile(signature, dto);
  }
}
