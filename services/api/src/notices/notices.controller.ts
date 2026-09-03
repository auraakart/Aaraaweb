import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { NoticesService } from './notices.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class CreateNoticeDto {
  @IsString() @MinLength(3) @MaxLength(160) title!: string;
  @IsString() @MinLength(5) @MaxLength(5000) body!: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsIn(['OWNER_ONLY', 'OWNER_AND_OCCUPANTS']) audience?: 'OWNER_ONLY' | 'OWNER_AND_OCCUPANTS';
}

class PublishNoticeDto {
  @IsOptional() @IsDateString() expiresAt?: string;
}

@Controller('notices')
@UseGuards(BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard)
@RequiresFeature(ProductFeature.NOTICES)
export class NoticesController {
  constructor(private readonly notices: NoticesService) {}

  @Get()
  @RequiresPermissions(AppPermission.NOTICE_READ)
  listPublished(@CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.notices.listPublished(societyId, this.requireUser(userId));
  }

  @Get('manage')
  @RequiresPermissions(AppPermission.NOTICE_MANAGE)
  listManage(@CurrentTenant() societyId: string) {
    return this.notices.listManage(societyId);
  }

  @Post('manage')
  @RequiresPermissions(AppPermission.NOTICE_MANAGE)
  create(@Body() dto: CreateNoticeDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.notices.createDraft(societyId, this.requireUser(userId), dto);
  }

  @Patch('manage/:noticeId/publish')
  @RequiresPermissions(AppPermission.NOTICE_MANAGE)
  publish(
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
    @Body() dto: PublishNoticeDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.notices.publish(societyId, this.requireUser(userId), noticeId, dto.expiresAt);
  }

  @Patch('manage/:noticeId/archive')
  @RequiresPermissions(AppPermission.NOTICE_MANAGE)
  archive(
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.notices.archive(societyId, this.requireUser(userId), noticeId);
  }

  @Get('manage/:noticeId/history')
  @RequiresPermissions(AppPermission.NOTICE_MANAGE)
  history(@Param('noticeId', ParseUUIDPipe) noticeId: string, @CurrentTenant() societyId: string) {
    return this.notices.history(societyId, noticeId);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
