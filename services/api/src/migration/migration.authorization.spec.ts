import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
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

  it('requires society configuration management across migration lifecycle operations', () => {
    for (const method of [
      'preview',
      'createBatch',
      'listBatches',
      'getBatch',
      'exportBatchEvidence',
      'commitBatch',
      'rollbackBatch',
    ] as const) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, MigrationController.prototype[method])).toEqual([
        AppPermission.SOCIETY_CONFIGURATION_MANAGE,
      ]);
    }
  });
});
