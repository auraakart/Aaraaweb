import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { GovernanceElectionHoldController } from './governance-election-hold.controller';

describe('GovernanceElectionHoldController boundaries',()=>{
  it('requires governance polls entitlement',()=>{
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY,GovernanceElectionHoldController)).toBe(ProductFeature.GOVERNANCE_POLLS);
  });
  it('keeps hold reads behind governance read and writes behind governance manage',()=>{
    expect(Reflect.getMetadata(PERMISSIONS_KEY,GovernanceElectionHoldController.prototype.list as object)).toEqual([AppPermission.GOVERNANCE_READ]);
    for(const method of ['open','resolve','cancel'] as const)
      expect(Reflect.getMetadata(PERMISSIONS_KEY,GovernanceElectionHoldController.prototype[method] as object)).toEqual([AppPermission.GOVERNANCE_MANAGE]);
  });
  it('does not expose ballot execution or vote-casting methods',()=>{
    const prototype=GovernanceElectionHoldController.prototype as unknown as Record<string,unknown>;
    for(const method of ['openBallot','castVote','submitBallot','tallyVotes','publishResult'])expect(method in prototype).toBe(false);
  });
});
