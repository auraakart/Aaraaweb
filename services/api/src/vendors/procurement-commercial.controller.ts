import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsInt, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProcurementCommercialService } from './procurement-commercial.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class AddQuoteDto {
  @IsUUID() vendorId!: string;
  @IsOptional() @IsString() @MaxLength(160) quoteReference?: string;
  @IsInt() @Min(0) amountPaise!: number;
  @IsOptional() @IsISO8601() validUntil?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
class SelectQuoteDto { @IsUUID() quoteId!: string; @IsOptional() @IsString() @MaxLength(1000) note?: string; }
class IssuePoDto { @IsString() @MaxLength(64) poNumber!: string; @IsOptional() @IsString() @MaxLength(3000) terms?: string; }

@Controller('vendors/procurement')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class ProcurementCommercialController {
  constructor(private readonly commercial: ProcurementCommercialService) {}

  @Get(':requestId/quotes')
  @RequiresPermissions(AppPermission.SOCIETY_VENDORS_READ)
  listQuotes(@CurrentTenant() societyId: string, @Param('requestId', ParseUUIDPipe) requestId: string) {
    return this.commercial.listQuotes(societyId, requestId);
  }

  @Post(':requestId/quotes')
  @RequiresPermissions(AppPermission.SOCIETY_VENDORS_MANAGE)
  addQuote(@CurrentTenant() societyId: string, @CurrentUser() userId: string | undefined, @Param('requestId', ParseUUIDPipe) requestId: string, @Body() dto: AddQuoteDto) {
    return this.commercial.addQuote(societyId, this.requireUser(userId), requestId, dto);
  }

  @Post(':requestId/select-quote')
  @RequiresPermissions(AppPermission.SOCIETY_VENDORS_MANAGE)
  selectQuote(@CurrentTenant() societyId: string, @CurrentUser() userId: string | undefined, @Param('requestId', ParseUUIDPipe) requestId: string, @Body() dto: SelectQuoteDto) {
    return this.commercial.selectQuote(societyId, this.requireUser(userId), requestId, dto.quoteId, dto.note);
  }

  @Post(':requestId/purchase-order')
  @RequiresPermissions(AppPermission.SOCIETY_VENDORS_MANAGE)
  issuePurchaseOrder(@CurrentTenant() societyId: string, @CurrentUser() userId: string | undefined, @Param('requestId', ParseUUIDPipe) requestId: string, @Body() dto: IssuePoDto) {
    return this.commercial.issuePurchaseOrder(societyId, this.requireUser(userId), requestId, dto);
  }

  @Get('purchase-orders/list')
  @RequiresPermissions(AppPermission.SOCIETY_VENDORS_READ)
  listPurchaseOrders(@CurrentTenant() societyId: string) {
    return this.commercial.listPurchaseOrders(societyId);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
