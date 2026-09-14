import { BadRequestException, Body, Controller, ExecutionContext, Param, ParseUUIDPipe, Patch, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsDateString, IsOptional } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { NoticeSchedulingService } from './notice-scheduling.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class ScheduleNoticeDto {
  @IsDateString() publishAt!: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}

@Controller('notices/manage')
@UseGuards(BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard)
@RequiresFeature(ProductFeature.NOTICES)
export class NoticeSchedulingController {
  constructor(private readonly scheduling: NoticeSchedulingService) {}

  @Patch(':noticeId/schedule')
  @RequiresPermissions(AppPermission.NOTICE_MANAGE)
  schedule(
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
    @Body() dto: ScheduleNoticeDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return this.scheduling.schedule(societyId, userId, noticeId, dto.publishAt, dto.expiresAt);
  }
}
