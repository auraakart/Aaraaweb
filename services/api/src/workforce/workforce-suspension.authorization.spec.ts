import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { FeatureGuard } from '../entitlements/feature.guard';
import { WorkforceSuspensionController } from './workforce-suspension.controller';

describe('WorkforceSuspensionController authorization', () => {
  it('requires bearer, tenant, feature and permission guards', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, WorkforceSuspensionController) as unknown[] | undefined;
    expect(guards).toEqual([BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard]);
  });

  it('requires society workforce review permission for all suspension controls', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, WorkforceSuspensionController)).toEqual([
      AppPermission.WORKFORCE_REVIEW,
    ]);
  });
});
