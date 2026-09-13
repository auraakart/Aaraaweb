import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { GovernancePollParticipationController } from './governance-poll-participation.controller';

const permissions=(method:keyof GovernancePollParticipationController)=>Reflect.getMetadata(PERMISSIONS_KEY,GovernancePollParticipationController.prototype[method] as object) as AppPermission[]|undefined;

describe('GovernancePollParticipationController permission boundaries',()=>{
  it('keeps community participation behind resident-readable society access',()=>{
    expect(permissions('listAvailable')).toEqual([AppPermission.NOTICE_READ]);
    expect(permissions('respond')).toEqual([AppPermission.NOTICE_READ]);
  });
  it('keeps poll lifecycle management behind governance management',()=>{
    expect(permissions('setStatus')).toEqual([AppPermission.GOVERNANCE_MANAGE]);
  });
});
