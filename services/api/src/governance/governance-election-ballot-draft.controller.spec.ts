import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { GovernanceElectionBallotDraftController } from './governance-election-ballot-draft.controller';

const permissions=(method:keyof GovernanceElectionBallotDraftController)=>Reflect.getMetadata(PERMISSIONS_KEY,GovernanceElectionBallotDraftController.prototype[method] as object) as AppPermission[]|undefined;

describe('GovernanceElectionBallotDraftController boundaries',()=>{
  it('requires the society governance-polls entitlement',()=>{
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY,GovernanceElectionBallotDraftController)).toBe(ProductFeature.GOVERNANCE_POLLS);
  });

  it('keeps election setup evidence readable only through governance read',()=>{
    for(const method of ['listReviews','listDrafts','getDraft','listDecisions'] as const)expect(permissions(method)).toEqual([AppPermission.GOVERNANCE_READ]);
  });

  it('keeps review, blueprint and decision mutations behind governance manage',()=>{
    for(const method of ['recordReview','createDraft','recordDecision'] as const)expect(permissions(method)).toEqual([AppPermission.GOVERNANCE_MANAGE]);
  });

  it('does not expose executable election or vote-casting methods',()=>{
    const prototype=GovernanceElectionBallotDraftController.prototype as unknown as Record<string,unknown>;
    for(const method of ['openBallot','closeBallot','castVote','submitBallot','tallyVotes','certifyResult','publishResult'])expect(method in prototype).toBe(false);
  });
});
