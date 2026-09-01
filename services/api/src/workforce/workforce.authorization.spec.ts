import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { FeatureGuard } from '../entitlements/feature.guard';
import { WorkforceController } from './workforce.controller';

describe('WorkforceController authorization', () => {
  it('requires bearer, tenant, feature and permission guards', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, WorkforceController) as unknown[] | undefined;
    expect(guards).toEqual([BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard]);
  });

  it('separates resident workforce permissions from society review permission', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, WorkforceController.prototype.mine)).toEqual([
      AppPermission.WORKFORCE_READ_OWN,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, WorkforceController.prototype.add)).toEqual([
      AppPermission.WORKFORCE_MANAGE_OWN,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, WorkforceController.prototype.deactivate)).toEqual([
      AppPermission.WORKFORCE_MANAGE_OWN,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, WorkforceController.prototype.pending)).toEqual([
      AppPermission.WORKFORCE_REVIEW,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, WorkforceController.prototype.approve)).toEqual([
      AppPermission.WORKFORCE_REVIEW,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, WorkforceController.prototype.reject)).toEqual([
      AppPermission.WORKFORCE_REVIEW,
    ]);
  });
});
