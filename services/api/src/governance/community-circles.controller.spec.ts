import 'reflect-metadata';
import { describe,expect,it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { CommunityCirclesController } from './community-circles.controller';

const permissions=(method:keyof CommunityCirclesController)=>
  Reflect.getMetadata(PERMISSIONS_KEY,CommunityCirclesController.prototype[method] as object) as AppPermission[]|undefined;

describe('CommunityCirclesController permission boundaries',()=>{
  it('keeps resident opt-in participation behind NOTICE_READ',()=>{
    expect(permissions('list')).toEqual([AppPermission.NOTICE_READ]);
    expect(permissions('join')).toEqual([AppPermission.NOTICE_READ]);
    expect(permissions('leave')).toEqual([AppPermission.NOTICE_READ]);
    expect(permissions('posts')).toEqual([AppPermission.NOTICE_READ]);
    expect(permissions('post')).toEqual([AppPermission.NOTICE_READ]);
  });

  it('keeps circle creation and lifecycle behind NOTICE_MANAGE',()=>{
    expect(permissions('manage')).toEqual([AppPermission.NOTICE_MANAGE]);
    expect(permissions('create')).toEqual([AppPermission.NOTICE_MANAGE]);
    expect(permissions('status')).toEqual([AppPermission.NOTICE_MANAGE]);
  });

  it('reuses the NOTICES entitlement instead of creating a parallel community entitlement',()=>{
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY,CommunityCirclesController)).toBe(ProductFeature.NOTICES);
  });
});
