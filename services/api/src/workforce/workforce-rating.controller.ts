import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Put, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { WorkforceRatingService } from './workforce-rating.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class RateWorkforceDto {
  @IsInt() @Min(1) @Max(5) score!: number;
  @IsOptional() @IsString() @MaxLength(300) comment?: string;
}

@Controller('workforce/ratings')
@UseGuards(BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard)
@RequiresFeature(ProductFeature.DOMESTIC_HELP)
export class WorkforceRatingController {
  constructor(private readonly ratings: WorkforceRatingService) {}

  @Get('mine')
  @RequiresPermissions(AppPermission.WORKFORCE_READ_OWN)
  mine(@CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated resident is required');
    return this.ratings.listMine(societyId, userId);
  }

  @Put(':assignmentId')
  @RequiresPermissions(AppPermission.WORKFORCE_MANAGE_OWN)
  rate(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: RateWorkforceDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    if (!userId) throw new BadRequestException('Authenticated resident is required');
    return this.ratings.rateMine(societyId, userId, assignmentId, dto);
  }

  @Get('review/summary')
  @RequiresPermissions(AppPermission.WORKFORCE_REVIEW)
  summary(@CurrentTenant() societyId: string) {
    return this.ratings.societySummary(societyId);
  }
}
