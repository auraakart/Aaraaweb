import { BadRequestException, Body, Controller, ExecutionContext, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { UtilityInvoicesService } from './utility-invoices.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class IssueUtilityInvoiceDto {
  @IsString() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) billingPeriod!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) dueDate!: string;
}

@Controller('utilities/v2/charge-drafts')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class UtilityInvoicesController {
  constructor(private readonly invoices: UtilityInvoicesService) {}

  @Post(':draftId/issue-invoice')
  @RequiresPermissions(AppPermission.BILLING_MANAGE)
  issue(
    @Param('draftId', ParseUUIDPipe) draftId: string,
    @Body() dto: IssueUtilityInvoiceDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return this.invoices.issueFromDraft(societyId, userId, draftId, dto);
  }
}
