import 'reflect-metadata';
import { describe,expect,it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { CommunityEventsController } from './community-events.controller';

const permissions=(method:keyof CommunityEventsController)=>
  Reflect.getMetadata(PERMISSIONS_KEY,CommunityEventsController.prototype[method] as object) as AppPermission[]|undefined;

describe('CommunityEventsController permission boundaries',()=>{
  it('keeps resident event visibility and RSVP behind NOTICE_READ',()=>{
    expect(permissions('list')).toEqual([AppPermission.NOTICE_READ]);
    expect(permissions('rsvp')).toEqual([AppPermission.NOTICE_READ]);
  });

  it('keeps event creation and lifecycle behind NOTICE_MANAGE',()=>{
    expect(permissions('manage')).toEqual([AppPermission.NOTICE_MANAGE]);
    expect(permissions('create')).toEqual([AppPermission.NOTICE_MANAGE]);
    expect(permissions('setStatus')).toEqual([AppPermission.NOTICE_MANAGE]);
  });

  it('requires the existing NOTICES entitlement instead of adding a parallel community product gate',()=>{
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY,CommunityEventsController)).toBe(ProductFeature.NOTICES);
  });
});
