import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
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

  it('fails readiness closed when privacy architecture evidence is missing',async()=>{
    const prisma={$queryRaw:vi.fn().mockResolvedValue([{
      ballotDraftId:'ballot',snapshotId:'snapshot',policyRevisionId:'policy',policyVersion:1,policyEnabled:true,policyCurrent:true,
      procedureRevisionId:'procedure',procedureVersion:1,privacyArchitectureRevisionId:null,privacyArchitectureVersion:null,
      reviewOutcome:'REVIEWED',reviewSequence:1,decisionOutcome:'APPROVED',decisionSequence:1,
    }])};
    const controller=new GovernanceElectionReadinessController(prisma as never);
    const result=await controller.assess('society','ballot');
    expect(result.configurationReady).toBe(false);
    expect(result.checks.privacyArchitectureConfigured).toBe(false);
    expect(result.blockers).toContain('PRIVACY_ARCHITECTURE_REQUIRED');
    expect(result.executionEnabled).toBe(false);
    expect(result.castingEnabled).toBe(false);
  });

  it('does not expose election execution or vote-casting methods',()=>{
    const prototype=GovernanceElectionReadinessController.prototype as unknown as Record<string,unknown>;
    for(const method of ['openBallot','closeBallot','castVote','submitBallot','tallyVotes','certifyResult','publishResult'])expect(method in prototype).toBe(false);
  });
});
