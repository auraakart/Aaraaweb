import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { AppPermission } from '../auth/permission.types';
import { FacilitiesContractsController } from './facilities-contracts.controller';

describe('FacilitiesContractsController permissions',()=>{
  it('requires facilities read for provider, contract and evidence listing',()=>{
    expect(Reflect.getMetadata(PERMISSIONS_KEY,FacilitiesContractsController.prototype.providers)).toEqual([AppPermission.FACILITIES_READ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY,FacilitiesContractsController.prototype.list)).toEqual([AppPermission.FACILITIES_READ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY,FacilitiesContractsController.prototype.evidence)).toEqual([AppPermission.FACILITIES_READ]);
  });

  it('requires facilities manage for contract and evidence mutations',()=>{
    expect(Reflect.getMetadata(PERMISSIONS_KEY,FacilitiesContractsController.prototype.create)).toEqual([AppPermission.FACILITIES_MANAGE]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY,FacilitiesContractsController.prototype.setStatus)).toEqual([AppPermission.FACILITIES_MANAGE]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY,FacilitiesContractsController.prototype.addEvidence)).toEqual([AppPermission.FACILITIES_MANAGE]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY,FacilitiesContractsController.prototype.verifyEvidence)).toEqual([AppPermission.FACILITIES_MANAGE]);
  });
});
