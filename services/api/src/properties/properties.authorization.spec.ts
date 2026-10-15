import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { BearerGuard } from '../auth/bearer.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { PropertiesController } from './properties.controller';

describe('PropertiesController authorization', () => {
  it('requires bearer, tenant, and permission guards', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, PropertiesController) as unknown[] | undefined;
    expect(guards).toEqual([BearerGuard, TenantGuard, PermissionsGuard]);
  });

  it('requires read permission for listing and manage permission for mutation', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, PropertiesController.prototype.listBuildings)).toEqual([
      AppPermission.SOCIETY_CONFIGURATION_READ,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, PropertiesController.prototype.listUnits)).toEqual([
      AppPermission.SOCIETY_CONFIGURATION_READ,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, PropertiesController.prototype.createBuilding)).toEqual([
      AppPermission.SOCIETY_CONFIGURATION_MANAGE,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, PropertiesController.prototype.createUnit)).toEqual([
      AppPermission.SOCIETY_CONFIGURATION_MANAGE,
    ]);
  });

  it('rejects a route society that differs from the authenticated tenant before service access', () => {
    const service = { listBuildings: vi.fn() };
    const controller = new PropertiesController(service as unknown as ConstructorParameters<typeof PropertiesController>[0]);
    expect(() => controller.listBuildings('society-a', 'society-b')).toThrow('Society path does not match authenticated tenant');
    expect(service.listBuildings).not.toHaveBeenCalled();
  });
});
