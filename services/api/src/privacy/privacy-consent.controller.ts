import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsBoolean, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { PrivacyConsentService } from './privacy-consent.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class RecordConsentDto {
  @IsUUID() subjectUserId!: string;
  @IsOptional() @IsString() @MaxLength(64) dataCategoryCode?: string;
  @IsString() @MaxLength(1000) purpose!: string;
  @IsBoolean() minorAtRecord!: boolean;
  @IsOptional() @IsUUID() representativeUserId?: string;
  @IsOptional() @IsString() @MaxLength(500) relationshipReference?: string;
  @IsOptional() @IsString() @MaxLength(1000) evidenceReference?: string;
  @IsISO8601() grantedAt!: string;
}

class WithdrawConsentDto {
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

@Controller('privacy/consents')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class PrivacyConsentController {
  constructor(private readonly consents: PrivacyConsentService) {}

  @Get()
  @RequiresPermissions(AppPermission.PRIVACY_OPERATIONS_READ)
  list(@CurrentTenant() societyId: string) {
    return this.consents.list(societyId);
  }

  @Post()
  @RequiresPermissions(AppPermission.PRIVACY_OPERATIONS_MANAGE)
  record(@Body() dto: RecordConsentDto, @CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    return this.consents.record(societyId, this.requireUser(userId), dto);
  }

  @Patch(':consentId/withdraw')
  @RequiresPermissions(AppPermission.PRIVACY_OPERATIONS_MANAGE)
  withdraw(
    @Param('consentId', ParseUUIDPipe) consentId: string,
    @Body() dto: WithdrawConsentDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    return this.consents.withdraw(societyId, this.requireUser(userId), consentId, dto.note);
  }

  @Get(':consentId/history')
  @RequiresPermissions(AppPermission.PRIVACY_OPERATIONS_READ)
  history(@Param('consentId', ParseUUIDPipe) consentId: string, @CurrentTenant() societyId: string) {
    return this.consents.history(societyId, consentId);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
