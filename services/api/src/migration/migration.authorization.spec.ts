import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { AppPermission } from '../auth/permission.types';
import { MigrationController } from './migration.controller';

describe('MigrationController authorization', () => {
  it('protects the controller with bearer, tenant and permission guards', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, MigrationController) as Array<{ name?: string }>;
    expect(guards.map((guard) => guard.name)).toEqual(expect.arrayContaining([
      'BearerGuard',
      'TenantGuard',
      'PermissionsGuard',
    ]));
  });

  it('requires society configuration management for migration preview', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, MigrationController.prototype.preview)).toEqual([
      AppPermission.SOCIETY_CONFIGURATION_MANAGE,
    ]);
  });
});
