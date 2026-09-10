import { Body, Controller, ExecutionContext, Get, Param, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { BearerGuard, AuthenticatedRequest } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { HouseholdChangeRequestService } from './household-change-request.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class ReviewDto {
  @IsOptional() @IsString() note?: string;
}

@Controller('household-change-requests')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class HouseholdChangeRequestsController {
  constructor(private readonly requests: HouseholdChangeRequestService) {}

  @Get('mine')
  @RequiresPermissions(AppPermission.HOUSEHOLD_READ_OWN)
  listMine(@CurrentTenant() societyId: string, @CurrentUser() userId: string) {
    return this.requests.listMine(societyId, userId);
  }

  @Get('admin/pending')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
  listPending(@CurrentTenant() societyId: string) {
    return this.requests.listPending(societyId);
  }

  @Post('admin/:requestId/approve')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
  approve(
    @Param('requestId') requestId: string,
    @Body() dto: ReviewDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string,
  ) {
    return this.requests.approve(societyId, userId, requestId, dto.note);
  }

  @Post('admin/:requestId/reject')
  @RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)
  reject(
    @Param('requestId') requestId: string,
    @Body() dto: ReviewDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string,
  ) {
    return this.requests.reject(societyId, userId, requestId, dto.note);
  }
}
