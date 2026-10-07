import {
  Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Patch, Post, Query,
  UnauthorizedException, UseGuards, createParamDecorator,
} from '@nestjs/common';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString,
  IsUUID, Matches, Max, MaxLength, Min,
} from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { FeatureGuard } from '../entitlements/feature.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import {
  CommunityCampaignStatus, CommunityServices3Service, RecurringPlanStatus,
  SERVICE_RECURRENCE_CADENCES, ServiceRecurrenceCadence,
} from './community-services-3.service';
import { ConsumerServiceLocationType } from './consumer-service-location.service';

const CurrentServiceUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);
const locationTypes = ['HOME', 'SOCIETY_UNIT'] as const;
const recurringStatuses: RecurringPlanStatus[] = ['ACTIVE', 'PAUSED', 'CANCELLED'];
const campaignStatuses: CommunityCampaignStatus[] = ['OPEN', 'LOCKED', 'CANCELLED', 'COMPLETED'];

class OfferingExperiencePolicyDto {
  @IsBoolean() quickServiceEligible!: boolean;
  @IsOptional() @IsInt() @Min(15) @Max(240) targetArrivalMinutes?: number | null;
  @IsOptional() @IsString() @MaxLength(1500) includedWork?: string | null;
  @IsOptional() @IsString() @MaxLength(1500) partsPolicy?: string | null;
  @IsBoolean() extraWorkApprovalRequired!: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(4) @IsIn(SERVICE_RECURRENCE_CADENCES, { each: true })
  recurrenceCadences?: ServiceRecurrenceCadence[];
}

class RecurringPlanDto {
  @IsUUID() offeringId!: string;
  @IsIn(locationTypes) locationType!: ConsumerServiceLocationType;
  @IsUUID() locationId!: string;
  @IsIn(SERVICE_RECURRENCE_CADENCES) cadence!: ServiceRecurrenceCadence;
  @IsOptional() @IsInt() @Min(1) @Max(7) preferredWeekday?: number | null;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) preferredTime?: string | null;
}
class RecurringPlanStatusDto { @IsIn(recurringStatuses) status!: RecurringPlanStatus; }
class LocationDto {
  @IsIn(locationTypes) locationType!: ConsumerServiceLocationType;
  @IsUUID() locationId!: string;
}
class CommunityDealCreateDto {
  @IsUUID() offeringId!: string;
  @IsString() @MaxLength(140) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @IsDateString() serviceDate!: string;
  @IsDateString() joinEndsAt!: string;
  @IsInt() @Min(2) @Max(5000) thresholdHomes!: number;
  @IsOptional() @IsInt() @Min(2) @Max(5000) maxHomes?: number | null;
  @IsInt() @Min(0) residentPricePaise!: number;
}
class CommunityDealStatusDto { @IsIn(campaignStatuses) status!: CommunityCampaignStatus; }

@Controller('provider/services/offerings')
@UseGuards(BearerGuard)
export class ProviderServiceExperienceController {
  constructor(private readonly services: CommunityServices3Service) {}
  @Get(':offeringId/experience-policy')
  getPolicy(@Param('offeringId', ParseUUIDPipe) offeringId: string) {
    return this.services.getOfferingExperiencePolicy(offeringId);
  }
  @Patch(':offeringId/experience-policy')
  setPolicy(@CurrentServiceUser() userId: string, @Param('offeringId', ParseUUIDPipe) offeringId: string, @Body() dto: OfferingExperiencePolicyDto) {
    return this.services.setMyOfferingExperiencePolicy(this.requireUser(userId), offeringId, dto);
  }
  private requireUser(userId?: string) {
    if (!userId) throw new UnauthorizedException('Authentication required');
    return userId;
  }
}

@Controller('consumer/services')
@UseGuards(BearerGuard)
export class ConsumerCommunityServicesController {
  constructor(private readonly services: CommunityServices3Service) {}
  @Get('recurring-plans')
  recurringPlans(@CurrentServiceUser() userId: string) {
    return this.services.listRecurringPlans(this.requireUser(userId));
  }
  @Post('recurring-plans')
  createRecurringPlan(@CurrentServiceUser() userId: string, @Body() dto: RecurringPlanDto) {
    return this.services.createRecurringPlan(this.requireUser(userId), dto);
  }
  @Patch('recurring-plans/:planId/status')
  setRecurringPlanStatus(@CurrentServiceUser() userId: string, @Param('planId', ParseUUIDPipe) planId: string, @Body() dto: RecurringPlanStatusDto) {
    return this.services.setRecurringPlanStatus(this.requireUser(userId), planId, dto.status);
  }
  @Get('community-deals')
  communityDeals(@CurrentServiceUser() userId: string, @Query() query: LocationDto) {
    return this.services.listCommunityDeals(this.requireUser(userId), query.locationType, query.locationId);
  }
  @Post('community-deals/:campaignId/join')
  joinCommunityDeal(@CurrentServiceUser() userId: string, @Param('campaignId', ParseUUIDPipe) campaignId: string, @Body() dto: LocationDto) {
    return this.services.joinCommunityDeal(this.requireUser(userId), campaignId, dto.locationType, dto.locationId);
  }
  @Post('community-deals/:campaignId/withdraw')
  withdrawCommunityDeal(@CurrentServiceUser() userId: string, @Param('campaignId', ParseUUIDPipe) campaignId: string, @Body() dto: LocationDto) {
    return this.services.withdrawCommunityDeal(this.requireUser(userId), campaignId, dto.locationType, dto.locationId);
  }
  private requireUser(userId?: string) {
    if (!userId) throw new UnauthorizedException('Authentication required');
    return userId;
  }
}

@Controller('services-marketplace/community-deals')
@UseGuards(BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard)
@RequiresFeature(ProductFeature.HOUSEHOLD_SERVICES)
export class ServicesCommunityDealAdminController {
  constructor(private readonly services: CommunityServices3Service) {}
  @Get('admin')
  @RequiresPermissions(AppPermission.SERVICES_PROVIDER_MANAGE)
  list(@CurrentTenant() societyId: string) {
    return this.services.listAdminCommunityDeals(societyId);
  }
  @Post('admin')
  @RequiresPermissions(AppPermission.SERVICES_PROVIDER_MANAGE)
  create(@CurrentTenant() societyId: string, @CurrentServiceUser() userId: string, @Body() dto: CommunityDealCreateDto) {
    return this.services.createCommunityDeal(societyId, this.requireUser(userId), {
      ...dto,
      serviceDate: new Date(dto.serviceDate),
      joinEndsAt: new Date(dto.joinEndsAt),
    });
  }
  @Patch('admin/:campaignId/status')
  @RequiresPermissions(AppPermission.SERVICES_PROVIDER_MANAGE)
  status(@CurrentTenant() societyId: string, @Param('campaignId', ParseUUIDPipe) campaignId: string, @Body() dto: CommunityDealStatusDto) {
    return this.services.setCommunityDealStatus(societyId, campaignId, dto.status);
  }
  private requireUser(userId?: string) {
    if (!userId) throw new UnauthorizedException('Authentication required');
    return userId;
  }
}
