import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { PermissionsGuard } from '../auth/permissions.guard';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ResidentsController } from './residents.controller';

describe('ResidentsController authorization', () => {
  it('enforces PermissionsGuard at controller scope', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ResidentsController) as unknown[];
    expect(guards).toContain(PermissionsGuard);
  });

  it('requires society configuration read permission to list residents', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ResidentsController.prototype.list)).toEqual([
      AppPermission.SOCIETY_CONFIGURATION_READ,
    ]);
  });

  it('requires society configuration manage permission for resident mutations', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ResidentsController.prototype.create)).toEqual([
      AppPermission.SOCIETY_CONFIGURATION_MANAGE,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ResidentsController.prototype.link)).toEqual([
      AppPermission.SOCIETY_CONFIGURATION_MANAGE,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ResidentsController.prototype.membership)).toEqual([
      AppPermission.SOCIETY_CONFIGURATION_MANAGE,
    ]);
  });
});
