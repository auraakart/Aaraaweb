import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { FacilitiesAlertsController } from './facilities-alerts.controller';

const permissions=(method:keyof FacilitiesAlertsController)=>Reflect.getMetadata(PERMISSIONS_KEY,FacilitiesAlertsController.prototype[method] as object) as AppPermission[]|undefined;

describe('FacilitiesAlertsController permissions',()=>{
  it('requires read permission for listing alerts',()=>expect(permissions('list')).toEqual([AppPermission.FACILITIES_READ]));
  it('requires manage permission for generation and lifecycle changes',()=>{
    expect(permissions('generate')).toEqual([AppPermission.FACILITIES_MANAGE]);
    expect(permissions('setStatus')).toEqual([AppPermission.FACILITIES_MANAGE]);
  });
});
