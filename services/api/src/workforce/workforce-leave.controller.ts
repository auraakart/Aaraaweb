import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { WorkforceLeaveService } from './workforce-leave.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class CreateWorkforceLeaveDto {
  @IsUUID() assignmentId!: string;
  @IsDateString() startsOn!: string;
  @IsDateString() endsOn!: string;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

@Controller('workforce/leaves')
@UseGuards(BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard)
@RequiresFeature(ProductFeature.DOMESTIC_HELP)
export class WorkforceLeaveController {
  constructor(private readonly leaves: WorkforceLeaveService) {}

  @Get('mine')
  @RequiresPermissions(AppPermission.WORKFORCE_READ_OWN)
  mine(@CurrentTenant() societyId: string, @CurrentUser() userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated resident is required');
    return this.leaves.listMine(societyId, userId);
  }

  @Post()
  @RequiresPermissions(AppPermission.WORKFORCE_MANAGE_OWN)
  create(
    @Body() dto: CreateWorkforceLeaveDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    if (!userId) throw new BadRequestException('Authenticated resident is required');
    return this.leaves.createMine(societyId, userId, dto);
  }

  @Patch(':leaveId/cancel')
  @RequiresPermissions(AppPermission.WORKFORCE_MANAGE_OWN)
  cancel(
    @Param('leaveId', ParseUUIDPipe) leaveId: string,
    @CurrentTenant() societyId: string,
    @CurrentUser() userId?: string,
  ) {
    if (!userId) throw new BadRequestException('Authenticated resident is required');
    return this.leaves.cancelMine(societyId, userId, leaveId);
  }

  @Get('review/active')
  @RequiresPermissions(AppPermission.WORKFORCE_REVIEW)
  activeForReview(@CurrentTenant() societyId: string, @Query('on') on?: string) {
    return this.leaves.listSocietyActive(societyId, on);
  }
}
