import 'reflect-metadata';
import { describe,expect,it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { ResidentDirectoryController } from './resident-directory.controller';

describe('ResidentDirectoryController privacy boundaries',()=>{
  it('keeps the directory behind the existing resident notice read authority',()=>{
    expect(Reflect.getMetadata(PERMISSIONS_KEY,ResidentDirectoryController)).toEqual([AppPermission.NOTICE_READ]);
  });

  it('reuses the NOTICES entitlement rather than inventing a directory entitlement',()=>{
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY,ResidentDirectoryController)).toBe(ProductFeature.NOTICES);
  });

  it('does not expose an admin/member-directory management endpoint',()=>{
    const methods=Object.getOwnPropertyNames(ResidentDirectoryController.prototype);
    expect(methods).toEqual(expect.arrayContaining(['list','mine','updateMine','requests','request','respond','withdraw']));
    expect(methods).not.toContain('manage');
  });
});
