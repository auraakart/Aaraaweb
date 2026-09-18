import {
  Body,
  Controller,
  ExecutionContext,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UnauthorizedException,
  UseGuards,
  createParamDecorator,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PrivacyService } from './privacy.service';

const CurrentPlatformPrivacyUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId;
});

class SetPlatformPrivacyStatusDto {
  @IsIn(['OPEN', 'IN_REVIEW', 'WAITING', 'COMPLETED', 'REJECTED', 'CANCELLED'])
  status!: 'OPEN' | 'IN_REVIEW' | 'WAITING' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

class SetPlatformPrivacyHoldDto {
  @IsBoolean()
  legalHold!: boolean;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  retentionReason?: string;
}

class SetPlatformPrivacyRetentionReviewDto {
  @IsIn(['ALLOW', 'BLOCK'])
  decision!: 'ALLOW' | 'BLOCK';

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

@Controller('platform/privacy')
@UseGuards(BearerGuard, PermissionsGuard)
export class PrivacyPlatformController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get('cases')
  @RequiresPermissions(AppPermission.PLATFORM_PRIVACY_READ)
  listCases() {
    return this.privacy.listPlatformCases();
  }

  @Get('cases/:caseId/history')
  @RequiresPermissions(AppPermission.PLATFORM_PRIVACY_READ)
  history(@Param('caseId', ParseUUIDPipe) caseId: string) {
    return this.privacy.history(undefined, caseId);
  }

  @Patch('cases/:caseId/status')
  @RequiresPermissions(AppPermission.PLATFORM_PRIVACY_MANAGE)
  setStatus(
    @CurrentPlatformPrivacyUser() userId: string | undefined,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: SetPlatformPrivacyStatusDto,
  ) {
    return this.privacy.updateStatus(undefined, this.requireUser(userId), caseId, dto.status, dto.note);
  }

  @Patch('cases/:caseId/legal-hold')
  @RequiresPermissions(AppPermission.PLATFORM_PRIVACY_MANAGE)
  setLegalHold(
    @CurrentPlatformPrivacyUser() userId: string | undefined,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: SetPlatformPrivacyHoldDto,
  ) {
    return this.privacy.updateLegalHold(undefined, this.requireUser(userId), caseId, dto.legalHold, dto.retentionReason);
  }

  @Patch('cases/:caseId/retention-review')
  @RequiresPermissions(AppPermission.PLATFORM_PRIVACY_MANAGE)
  setRetentionReview(
    @CurrentPlatformPrivacyUser() userId: string | undefined,
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: SetPlatformPrivacyRetentionReviewDto,
  ) {
    return this.privacy.updateRetentionReview(undefined, this.requireUser(userId), caseId, dto.decision, dto.reason);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new UnauthorizedException('Authentication required');
    return userId;
  }
}
