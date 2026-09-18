import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsBoolean, IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { PrivacyService } from './privacy.service';
import { PrivacySubjectDataService } from './privacy-subject-data.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

const REQUEST_TYPES = ['ACCESS', 'CORRECTION', 'ERASURE', 'OTHER'] as const;
const CASE_STATUSES = ['OPEN', 'IN_REVIEW', 'WAITING', 'COMPLETED', 'REJECTED', 'CANCELLED'] as const;

class CreatePrivacyCaseDto {
  @IsUUID() subjectUserId!: string;
  @IsIn(REQUEST_TYPES) requestType!: (typeof REQUEST_TYPES)[number];
  @IsString() @MaxLength(2000) requestSummary!: string;
  @IsOptional() @IsUUID() assignedToUserId?: string;
  @IsOptional() @IsISO8601() dueAt?: string;
}

class UpdatePrivacyCaseStatusDto {
  @IsIn(CASE_STATUSES) status!: (typeof CASE_STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

class UpdatePrivacyLegalHoldDto {
  @IsBoolean() legalHold!: boolean;
  @IsOptional() @IsString() @MaxLength(1000) retentionReason?: string;
}

class UpdatePrivacyRetentionReviewDto {
  @IsIn(['ALLOW', 'BLOCK']) decision!: 'ALLOW' | 'BLOCK';
  @IsString() @MaxLength(1000) reason!: string;
}

@Controller('privacy')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService, private readonly subjectData: PrivacySubjectDataService) {}

  @Get('cases')
  @RequiresPermissions(AppPermission.PRIVACY_OPERATIONS_READ)
  listCases(@CurrentTenant() societyId: string) {
    return this.privacy.listCases(societyId);
  }

  @Post('cases')
  @RequiresPermissions(AppPermission.PRIVACY_OPERATIONS_MANAGE)
  createCase(
    @Body() dto: CreatePrivacyCaseDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.privacy.createCase(societyId, this.requireUser(userId), dto);
  }

  @Get('cases/:caseId/erasure-plan')
  @RequiresPermissions(AppPermission.PRIVACY_OPERATIONS_READ)
  erasurePlan(@Param('caseId', ParseUUIDPipe) caseId: string, @CurrentTenant() societyId: string) {
    return this.subjectData.erasurePlan(societyId, caseId);
  }

  @Post('cases/:caseId/execute-erasure')
  @RequiresPermissions(AppPermission.PRIVACY_OPERATIONS_MANAGE)
  executeErasure(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.subjectData.executeErasure(societyId, this.requireUser(userId), caseId);
  }

  @Get('cases/:caseId/history')
  @RequiresPermissions(AppPermission.PRIVACY_OPERATIONS_READ)
  history(@Param('caseId', ParseUUIDPipe) caseId: string, @CurrentTenant() societyId: string) {
    return this.privacy.history(societyId, caseId);
  }

  @Patch('cases/:caseId/status')
  @RequiresPermissions(AppPermission.PRIVACY_OPERATIONS_MANAGE)
  updateStatus(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: UpdatePrivacyCaseStatusDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.privacy.updateStatus(societyId, this.requireUser(userId), caseId, dto.status, dto.note);
  }

  @Patch('cases/:caseId/legal-hold')
  @RequiresPermissions(AppPermission.PRIVACY_OPERATIONS_MANAGE)
  updateLegalHold(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: UpdatePrivacyLegalHoldDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.privacy.updateLegalHold(
      societyId,
      this.requireUser(userId),
      caseId,
      dto.legalHold,
      dto.retentionReason,
    );
  }

  @Patch('cases/:caseId/retention-review')
  @RequiresPermissions(AppPermission.PRIVACY_OPERATIONS_MANAGE)
  updateRetentionReview(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: UpdatePrivacyRetentionReviewDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.privacy.updateRetentionReview(societyId, this.requireUser(userId), caseId, dto.decision, dto.reason);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
