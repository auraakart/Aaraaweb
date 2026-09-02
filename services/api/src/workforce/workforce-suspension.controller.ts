import {
  BadRequestException,
  Body,
  Controller,
  ExecutionContext,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
  createParamDecorator,
} from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { WorkforceSuspensionService } from './workforce-suspension.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class SuspendWorkforceDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

class ReinstateWorkforceDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

@Controller('workforce/control')
@UseGuards(BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard)
@RequiresFeature(ProductFeature.DOMESTIC_HELP)
@RequiresPermissions(AppPermission.WORKFORCE_REVIEW)
export class WorkforceSuspensionController {
  constructor(private readonly suspensions: WorkforceSuspensionService) {}

  @Get('suspended')
  listSuspended(@CurrentTenant() societyId: string) {
    return this.suspensions.listSuspended(societyId);
  }

  @Get('history')
  history(@CurrentTenant() societyId: string) {
    return this.suspensions.history(societyId);
  }

  @Patch('workers/:workerId/suspend')
  suspendWorker(
    @Param('workerId', ParseUUIDPipe) workerId: string,
    @Body() dto: SuspendWorkforceDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() actorUserId?: string,
  ) {
    if (!actorUserId) throw new BadRequestException('Authenticated reviewer is required');
    return this.suspensions.suspendWorker(societyId, workerId, actorUserId, dto.reason);
  }

  @Patch('workers/:workerId/reinstate')
  reinstateWorker(
    @Param('workerId', ParseUUIDPipe) workerId: string,
    @Body() dto: ReinstateWorkforceDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() actorUserId?: string,
  ) {
    if (!actorUserId) throw new BadRequestException('Authenticated reviewer is required');
    return this.suspensions.reinstateWorker(societyId, workerId, actorUserId, dto.reason);
  }

  @Patch('assignments/:assignmentId/suspend')
  suspendAssignment(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: SuspendWorkforceDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() actorUserId?: string,
  ) {
    if (!actorUserId) throw new BadRequestException('Authenticated reviewer is required');
    return this.suspensions.suspendAssignment(societyId, assignmentId, actorUserId, dto.reason);
  }

  @Patch('assignments/:assignmentId/reinstate')
  reinstateAssignment(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: ReinstateWorkforceDto,
    @CurrentTenant() societyId: string,
    @CurrentUser() actorUserId?: string,
  ) {
    if (!actorUserId) throw new BadRequestException('Authenticated reviewer is required');
    return this.suspensions.reinstateAssignment(societyId, assignmentId, actorUserId, dto.reason);
  }
}
