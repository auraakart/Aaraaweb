import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe,expect,it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { OperationalUsageController } from './operational-usage.controller';

describe('V4.8 analytics authorization',()=>{
  it('requires gate processing authority for guard sync metrics',()=>{
    expect(Reflect.getMetadata(PERMISSIONS_KEY,OperationalUsageController.prototype.guardSync)).toEqual([AppPermission.GATE_ACCESS_PROCESS]);
    const guards=(Reflect.getMetadata(GUARDS_METADATA,OperationalUsageController.prototype.guardSync)??[]) as unknown[];
    expect(guards).toContain(TenantGuard);
    expect(guards).toContain(PermissionsGuard);
  });
});
