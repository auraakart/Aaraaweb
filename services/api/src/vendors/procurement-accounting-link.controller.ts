import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProcurementAccountingLinkService } from './procurement-accounting-link.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class CreateExpenseFromPoDto {
  @IsString() @MaxLength(64) expenseNumber!: string;
  @IsISO8601() expenseDate!: string;
  @IsOptional() @IsISO8601() dueDate?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsUUID() expenseAccountId!: string;
  @IsOptional() @IsUUID() fundId?: string;
  @IsOptional() @IsString() @MaxLength(160) invoiceReference?: string;
}

@Controller('vendors/procurement/accounting')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class ProcurementAccountingLinkController {
  constructor(private readonly links: ProcurementAccountingLinkService) {}

  @Get('links')
  @RequiresPermissions(AppPermission.SOCIETY_VENDORS_READ, AppPermission.FINANCE_READ)
  list(@CurrentTenant() societyId: string) {
    return this.links.listLinks(societyId);
  }

  @Post('purchase-orders/:purchaseOrderId/expense-draft')
  @RequiresPermissions(AppPermission.SOCIETY_VENDORS_MANAGE, AppPermission.FINANCE_MANAGE)
  createExpense(
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string | undefined,
    @Param('purchaseOrderId', ParseUUIDPipe) purchaseOrderId: string,
    @Body() dto: CreateExpenseFromPoDto,
  ) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return this.links.createExpenseDraftFromPurchaseOrder(societyId, userId, purchaseOrderId, dto);
  }
}
