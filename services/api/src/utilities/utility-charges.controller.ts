import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { UtilityChargesService } from './utility-charges.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class CreateUtilityChargeDraftDto {
  @IsUUID() openingReadingId!: string;
  @IsUUID() closingReadingId!: string;
}

class VoidUtilityChargeDraftDto {
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

@Controller('utilities/v2/charge-drafts')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class UtilityChargesController {
  constructor(private readonly charges: UtilityChargesService) {}

  @Get()
  @RequiresPermissions(AppPermission.FINANCE_READ)
  list(@CurrentTenant() societyId: string) {
    return this.charges.listDrafts(societyId);
  }

  @Post()
  @RequiresPermissions(AppPermission.BILLING_MANAGE)
  create(@Body() dto: CreateUtilityChargeDraftDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.charges.createDraft(societyId, this.requireUser(userId), dto);
  }

  @Post(':draftId/void')
  @RequiresPermissions(AppPermission.BILLING_MANAGE)
  void(
    @Param('draftId', ParseUUIDPipe) draftId: string,
    @Body() dto: VoidUtilityChargeDraftDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.charges.voidDraft(societyId, this.requireUser(userId), draftId, dto.note);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
