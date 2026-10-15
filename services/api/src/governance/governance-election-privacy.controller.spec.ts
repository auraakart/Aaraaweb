import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { GovernanceElectionPrivacyController } from './governance-election-privacy.controller';

const permissions=(method:keyof GovernanceElectionPrivacyController)=>Reflect.getMetadata(PERMISSIONS_KEY,GovernanceElectionPrivacyController.prototype[method] as object) as AppPermission[]|undefined;

describe('GovernanceElectionPrivacyController boundaries',()=>{
  it('requires governance polls entitlement',()=>{
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY,GovernanceElectionPrivacyController)).toBe(ProductFeature.GOVERNANCE_POLLS);
  });

  it('keeps architecture reads and writes behind governance capabilities',()=>{
    expect(permissions('current')).toEqual([AppPermission.GOVERNANCE_READ]);
    expect(permissions('record')).toEqual([AppPermission.GOVERNANCE_MANAGE]);
  });

  it('does not expose credentials, votes or executable election methods',()=>{
    const prototype=GovernanceElectionPrivacyController.prototype as unknown as Record<string,unknown>;
    for(const method of ['issueCredential','rotateKey','castVote','submitBallot','openBallot','decryptBallot','tallyVotes'])expect(method in prototype).toBe(false);
  });
});
