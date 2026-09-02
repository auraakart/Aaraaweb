import { BadRequestException, Body, Controller, ExecutionContext, Get, Headers, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
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

  @Get('invoices/admin')
  @RequiresFeature(ProductFeature.MAINTENANCE_BILLING)
  @RequiresPermissions(AppPermission.BILLING_MANAGE)
  admin(@CurrentTenant() societyId: string) { return this.billing.listForSociety(societyId); }

  @Post('invoices/admin')
  @RequiresFeature(ProductFeature.MAINTENANCE_BILLING)
  @RequiresPermissions(AppPermission.BILLING_MANAGE)
  issue(@Body() dto: CreateInvoiceDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.billing.issue(societyId, this.requireUser(userId), dto);
  }

  @Post('payments')
  @RequiresFeature(ProductFeature.PAYMENTS)
  @RequiresPermissions(AppPermission.PROPERTY_FINANCE_READ, AppPermission.PAYMENT_CREATE_OWN)
  pay(@Body() dto: CreatePaymentDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.billing.createPayment(societyId, this.requireUser(userId), dto.invoiceId, dto.idempotencyKey);
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
