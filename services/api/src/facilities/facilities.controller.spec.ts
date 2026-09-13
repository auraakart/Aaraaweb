import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { FacilitiesController } from './facilities.controller';

const permissions=(method:keyof FacilitiesController)=>Reflect.getMetadata(PERMISSIONS_KEY,FacilitiesController.prototype[method] as object) as AppPermission[]|undefined;

describe('FacilitiesController permission boundaries',()=>{
  it('keeps facilities reads behind FACILITIES_READ',()=>{
    expect(permissions('listAssets')).toEqual([AppPermission.FACILITIES_READ]);
    expect(permissions('listWorkOrders')).toEqual([AppPermission.FACILITIES_READ]);
  });
  it('keeps facilities mutations behind FACILITIES_MANAGE',()=>{
    expect(permissions('createAsset')).toEqual([AppPermission.FACILITIES_MANAGE]);
    expect(permissions('createWorkOrder')).toEqual([AppPermission.FACILITIES_MANAGE]);
    expect(permissions('setWorkOrderStatus')).toEqual([AppPermission.FACILITIES_MANAGE]);
  });
});
