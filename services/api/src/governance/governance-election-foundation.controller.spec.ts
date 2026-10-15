import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { GovernanceElectionFoundationController } from './governance-election-foundation.controller';

const permissions=(method:keyof GovernanceElectionFoundationController)=>Reflect.getMetadata(PERMISSIONS_KEY,GovernanceElectionFoundationController.prototype[method] as object) as AppPermission[]|undefined;

describe('GovernanceElectionFoundationController boundaries',()=>{
  it('requires the society governance-polls entitlement',()=>{
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY,GovernanceElectionFoundationController)).toBe(ProductFeature.GOVERNANCE_POLLS);
  });

  it('keeps policy and snapshot reads behind GOVERNANCE_READ',()=>{
    for(const method of ['currentPolicy','listSnapshots','getSnapshot'] as const)expect(permissions(method)).toEqual([AppPermission.GOVERNANCE_READ]);
  });

  it('keeps policy revisions and electorate capture behind GOVERNANCE_MANAGE',()=>{
    for(const method of ['recordPolicy','createSnapshot'] as const)expect(permissions(method)).toEqual([AppPermission.GOVERNANCE_MANAGE]);
  });

  it('does not expose a ballot-casting method in this foundation',()=>{
    expect('castVote' in GovernanceElectionFoundationController.prototype).toBe(false);
    expect('submitBallot' in GovernanceElectionFoundationController.prototype).toBe(false);
  });
});
