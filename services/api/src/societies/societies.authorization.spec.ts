import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { SocietiesController } from './societies.controller';

describe('SocietiesController authorization', () => {
  it('limits society listing and creation to super admin', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, SocietiesController.prototype.list)).toEqual([BearerGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, SocietiesController.prototype.list)).toEqual([AppRole.SUPER_ADMIN]);
    expect(Reflect.getMetadata(GUARDS_METADATA, SocietiesController.prototype.create)).toEqual([BearerGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, SocietiesController.prototype.create)).toEqual([AppRole.SUPER_ADMIN]);
  });

  it('requires tenant-scoped configuration read permission for society detail', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, SocietiesController.prototype.get)).toEqual([
      BearerGuard,
      TenantGuard,
      PermissionsGuard,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, SocietiesController.prototype.get)).toEqual([
      AppPermission.SOCIETY_CONFIGURATION_READ,
    ]);
  });

  it('rejects cross-tenant society detail access before querying Prisma', () => {
    const prisma = { society: { findUniqueOrThrow: vi.fn() } };
    const controller = new SocietiesController(prisma as unknown as ConstructorParameters<typeof SocietiesController>[0]);
    expect(() => controller.get('society-a', 'society-b')).toThrow('Society path does not match authenticated tenant');
    expect(prisma.society.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
