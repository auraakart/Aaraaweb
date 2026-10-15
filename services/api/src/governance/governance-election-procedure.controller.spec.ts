import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { GovernanceElectionProcedureController } from './governance-election-procedure.controller';

const permissions=(method:keyof GovernanceElectionProcedureController)=>Reflect.getMetadata(PERMISSIONS_KEY,GovernanceElectionProcedureController.prototype[method] as object) as AppPermission[]|undefined;

describe('GovernanceElectionProcedureController boundaries',()=>{
  it('requires governance polls entitlement',()=>{
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY,GovernanceElectionProcedureController)).toBe(ProductFeature.GOVERNANCE_POLLS);
  });
  it('keeps procedure reads behind governance read',()=>expect(permissions('current')).toEqual([AppPermission.GOVERNANCE_READ]));
  it('keeps procedure revisions behind governance manage',()=>expect(permissions('record')).toEqual([AppPermission.GOVERNANCE_MANAGE]));
  it('does not expose election execution methods',()=>{
    const prototype=GovernanceElectionProcedureController.prototype as unknown as Record<string,unknown>;
    for(const method of ['openBallot','closeBallot','castVote','submitBallot','tallyVotes','certifyResult','publishResult'])expect(method in prototype).toBe(false);
  });
});
