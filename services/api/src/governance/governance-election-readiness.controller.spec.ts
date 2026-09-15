import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { GovernanceElectionReadinessController } from './governance-election-readiness.controller';

describe('GovernanceElectionReadinessController boundaries',()=>{
  it('requires governance polls entitlement',()=>{
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY,GovernanceElectionReadinessController)).toBe(ProductFeature.GOVERNANCE_POLLS);
  });

  it('keeps readiness assessment behind governance read',()=>{
    expect(Reflect.getMetadata(PERMISSIONS_KEY,GovernanceElectionReadinessController.prototype.assess as object)).toEqual([AppPermission.GOVERNANCE_READ]);
  });

  it('does not expose election execution or vote-casting methods',()=>{
    const prototype=GovernanceElectionReadinessController.prototype as unknown as Record<string,unknown>;
    for(const method of ['openBallot','closeBallot','castVote','submitBallot','tallyVotes','certifyResult','publishResult'])expect(method in prototype).toBe(false);
  });
});
