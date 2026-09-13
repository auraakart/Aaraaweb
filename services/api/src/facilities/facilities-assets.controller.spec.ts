import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { FacilitiesAssetsController } from './facilities-assets.controller';

describe('FacilitiesAssetsController permissions',()=>{
  it('keeps asset lifecycle mutations behind FACILITIES_MANAGE',()=>{
    expect(Reflect.getMetadata(PERMISSIONS_KEY,FacilitiesAssetsController.prototype.setStatus)).toEqual([AppPermission.FACILITIES_MANAGE]);
  });
});
