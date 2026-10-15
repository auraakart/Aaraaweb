import { BadRequestException, Body, Controller, ExecutionContext, Get, Put, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { SosRoutingService } from './sos-routing.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class UpsertSosRoutingPolicyDto {
  @IsIn(['CRITICAL','HIGH','MEDIUM']) severity!: 'CRITICAL'|'HIGH'|'MEDIUM';
  @IsInt() @Min(1) @Max(1440) acknowledgeWithinMinutes!: number;
  @IsUUID() responderUserId!: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

@Controller('sos/manage/routing')
@UseGuards(BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard)
@RequiresFeature(ProductFeature.SOS)
@RequiresPermissions(AppPermission.SOS_RESPOND)
export class SosRoutingController {
  constructor(private readonly routing: SosRoutingService) {}

  @Get('policies')
  policies(@CurrentTenant() societyId: string) {
    return this.routing.listPolicies(societyId);
  }

  @Get('candidates')
  candidates(@CurrentTenant() societyId: string) {
    return this.routing.listCandidates(societyId);
  }

  @Put('policies')
  upsertPolicy(
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string | undefined,
    @Body() dto: UpsertSosRoutingPolicyDto,
  ) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return this.routing.upsertPolicy(societyId, userId, dto);
  }
}
