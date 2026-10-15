import { BadRequestException, Body, Controller, ExecutionContext, Param, ParseUUIDPipe, Patch, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { NoticeTargetingService } from './notice-targeting.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class SetNoticeTargetDto {
  @IsOptional() @IsUUID() buildingId?: string;
  @IsOptional() @IsUUID() unitId?: string;
}

@Controller('notices/manage')
@UseGuards(BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard)
@RequiresFeature(ProductFeature.NOTICES)
export class NoticeTargetingController {
  constructor(private readonly targeting: NoticeTargetingService) {}

  @Patch(':noticeId/target')
  @RequiresPermissions(AppPermission.NOTICE_MANAGE)
  setTarget(
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
    @Body() dto: SetNoticeTargetDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return this.targeting.setTarget(societyId, userId, noticeId, dto);
  }
}
