import {
  Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Req, UseGuards,
} from '@nestjs/common';
import { ArrayUnique, IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Min } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppRole } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ProductFeature } from './entitlement.types';
import { PartnerLicensePersistenceService } from './partner-license-persistence.service';

class LicensePlanRevisionDto {
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{2,39}$/) code!: string;
  @IsInt() @Min(0) expectedVersion!: number;
  @IsArray() @ArrayUnique() @IsEnum(ProductFeature, { each: true })
  featureAllowlist!: ProductFeature[];
  @IsInt() @Min(0) maximumSocieties!: number;
  @IsInt() @Min(0) maximumDomains!: number;
  @IsInt() @Min(0) maximumDistributions!: number;
}

class LicenseGrantDraftDto {
  @IsUUID() planRevisionId!: string;
  @IsString() startsAt!: string;
  @IsString() endsAt!: string;
  @IsOptional() @IsString() graceUntil?: string | null;
  @IsUUID() idempotencyKey!: string;
}

/**
 * V5.4.3 platform control plane. Routes can only create versioned plan
 * snapshots and DRAFT license grants with an append-only audit event.
 * They never allocate a society, GRANT a license, or alter FeatureGuard.
 */
@Controller('platform')
@UseGuards(BearerGuard, RolesGuard)
@Roles(AppRole.SUPER_ADMIN)
export class PlatformPartnerLicenseController {
  constructor(private readonly licenses: PartnerLicensePersistenceService) {}

  @Get('license-plans')
  @Header('Cache-Control', 'no-store')
  plans() { return this.licenses.listPlans(); }

  @Post('license-plans/revisions')
  @Header('Cache-Control', 'no-store')
  createPlan(@Req() request: AuthenticatedRequest, @Body() dto: LicensePlanRevisionDto) {
    return this.licenses.createPlanRevision(request.auth!.userId, dto);
  }

  @Get('partners/:partnerId/license-drafts')
  @Header('Cache-Control', 'no-store')
  drafts(@Param('partnerId', ParseUUIDPipe) partnerId: string) {
    return this.licenses.listPartnerDrafts(partnerId);
  }

  @Post('partners/:partnerId/license-drafts')
  @Header('Cache-Control', 'no-store')
  createDraft(
    @Req() request: AuthenticatedRequest,
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Body() dto: LicenseGrantDraftDto,
  ) {
    return this.licenses.createGrantDraft(request.auth!.userId, partnerId, dto);
  }
}
