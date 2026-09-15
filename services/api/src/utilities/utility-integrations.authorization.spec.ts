import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { TenantGuard } from '../auth/tenant.guard';
import {
  UtilityIntegrationIngestionController,
  UtilityIntegrationManagementController,
} from './utility-integrations.controller';

describe('Utility integration authorization', () => {
  it('protects management with bearer, tenant and permission guards', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, UtilityIntegrationManagementController)).toEqual([
      BearerGuard,
      TenantGuard,
      PermissionsGuard,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, UtilityIntegrationManagementController.prototype.list)).toEqual([
      AppPermission.FACILITIES_READ,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, UtilityIntegrationManagementController.prototype.receipts)).toEqual([
      AppPermission.FACILITIES_READ,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, UtilityIntegrationManagementController.prototype.create)).toEqual([
      AppPermission.FACILITIES_MANAGE,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, UtilityIntegrationManagementController.prototype.createMapping)).toEqual([
      AppPermission.FACILITIES_MANAGE,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, UtilityIntegrationManagementController.prototype.revoke)).toEqual([
      AppPermission.FACILITIES_MANAGE,
    ]);
  });

  it('keeps the machine endpoint outside user guards so the service can authenticate the hashed integration key', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, UtilityIntegrationIngestionController)).toBeUndefined();
  });
});
