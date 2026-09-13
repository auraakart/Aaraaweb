import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { FacilitiesPreventiveController } from './facilities-preventive.controller';

const permissions=(method:string)=>Reflect.getMetadata(PERMISSIONS_KEY,(FacilitiesPreventiveController.prototype as unknown as Record<string,object>)[method]) as AppPermission[]|undefined;

describe('FacilitiesPreventiveController permissions',()=>{
  it('keeps plan and metrics reads on FACILITIES_READ',()=>{
    expect(permissions('list')).toEqual([AppPermission.FACILITIES_READ]);
    expect(permissions('metrics')).toEqual([AppPermission.FACILITIES_READ]);
  });
  it('keeps plan mutation and due generation on FACILITIES_MANAGE',()=>{
    expect(permissions('create')).toEqual([AppPermission.FACILITIES_MANAGE]);
    expect(permissions('setActive')).toEqual([AppPermission.FACILITIES_MANAGE]);
    expect(permissions('generateDue')).toEqual([AppPermission.FACILITIES_MANAGE]);
  });
});
