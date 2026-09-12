import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { GovernanceController } from './governance.controller';

const permissions=(method:keyof GovernanceController)=>Reflect.getMetadata(PERMISSIONS_KEY,GovernanceController.prototype[method] as object) as AppPermission[]|undefined;

describe('GovernanceController permission boundaries',()=>{
  it('keeps governance reads behind GOVERNANCE_READ',()=>{
    expect(permissions('listCommittee')).toEqual([AppPermission.GOVERNANCE_READ]);
    expect(permissions('listMeetings')).toEqual([AppPermission.GOVERNANCE_READ]);
    expect(permissions('getMeeting')).toEqual([AppPermission.GOVERNANCE_READ]);
  });
  it('keeps governance mutations behind GOVERNANCE_MANAGE',()=>{
    for(const method of ['createTenure','endTenure','createMeeting','outcome','agenda','resolution','action'] as const){
      expect(permissions(method)).toEqual([AppPermission.GOVERNANCE_MANAGE]);
    }
  });
});
