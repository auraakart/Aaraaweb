import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { GovernanceArtifactsController } from './governance-artifacts.controller';

const permissions=(method:keyof GovernanceArtifactsController)=>Reflect.getMetadata(PERMISSIONS_KEY,GovernanceArtifactsController.prototype[method] as object) as AppPermission[]|undefined;

describe('GovernanceArtifactsController permission boundaries',()=>{
  it('keeps document and poll reads behind GOVERNANCE_READ',()=>{
    for(const method of ['listDocuments','listPolls','getPoll'] as const)expect(permissions(method)).toEqual([AppPermission.GOVERNANCE_READ]);
  });
  it('keeps document and poll mutations behind GOVERNANCE_MANAGE',()=>{
    for(const method of ['addDocument','verifyDocument','createPoll'] as const)expect(permissions(method)).toEqual([AppPermission.GOVERNANCE_MANAGE]);
  });
});
