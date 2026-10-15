import { BadRequestException, Body, Controller, Delete, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { NoticeAttachmentsService } from './notice-attachments.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class AttachDocumentDto {
  @IsUUID() documentId!: string;
}

@Controller('notices')
@UseGuards(BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard)
@RequiresFeature(ProductFeature.NOTICES)
export class NoticeAttachmentsController {
  constructor(private readonly attachments: NoticeAttachmentsService) {}

  @Get(':noticeId/attachments')
  @RequiresPermissions(AppPermission.NOTICE_READ)
  residentList(
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return this.attachments.listForResident(societyId, userId, noticeId);
  }

  @Get('manage/:noticeId/attachments')
  @RequiresPermissions(AppPermission.NOTICE_MANAGE)
  managementList(@Param('noticeId', ParseUUIDPipe) noticeId: string, @CurrentTenant() societyId: string) {
    return this.attachments.listManage(societyId, noticeId);
  }

  @Post('manage/:noticeId/attachments')
  @RequiresPermissions(AppPermission.NOTICE_MANAGE)
  attach(
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
    @Body() dto: AttachDocumentDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return this.attachments.attach(societyId, userId, noticeId, dto.documentId);
  }

  @Delete('manage/:noticeId/attachments/:documentId')
  @RequiresPermissions(AppPermission.NOTICE_MANAGE)
  detach(
    @Param('noticeId', ParseUUIDPipe) noticeId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return this.attachments.detach(societyId, userId, noticeId, documentId);
  }
}
