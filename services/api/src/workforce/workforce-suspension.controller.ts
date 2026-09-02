import { Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { WorkforceSuspensionService } from './workforce-suspension.service';

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

  @Patch('workers/:workerId/suspend')
  suspendWorker(
    @Param('workerId', ParseUUIDPipe) workerId: string,
    @CurrentTenant() societyId: string,
  ) {
    return this.suspensions.suspendWorker(societyId, workerId);
  }

  @Patch('workers/:workerId/reinstate')
  reinstateWorker(
    @Param('workerId', ParseUUIDPipe) workerId: string,
    @CurrentTenant() societyId: string,
  ) {
    return this.suspensions.reinstateWorker(societyId, workerId);
  }

  @Patch('assignments/:assignmentId/suspend')
  suspendAssignment(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @CurrentTenant() societyId: string,
  ) {
    return this.suspensions.suspendAssignment(societyId, assignmentId);
  }

  @Patch('assignments/:assignmentId/reinstate')
  reinstateAssignment(
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @CurrentTenant() societyId: string,
  ) {
    return this.suspensions.reinstateAssignment(societyId, assignmentId);
  }
}
