import {describe,expect,it,vi} from 'vitest';
import {ProductFeature} from '../entitlements/entitlement.types';
import {OnboardingReadinessService} from './onboarding-readiness.service';

function setup(input?:{
  buildings?:number;
  roles?:number;
  migrationComplete?:boolean;
  blockedStages?:number;
  readyStages?:number;
  features?:ProductFeature[];
  snapshot?:Partial<{
    auditorAssignments:number;accessConfigured:boolean;paymentConfigured:boolean;activeAmenities:number;
    openAccountingPeriods:number;activeCommitteeTenures:number;governanceMeetings:number;evaluatedAt:Date;
  }>;
}){
  const evaluatedAt=new Date('2026-09-29T12:00:00.000Z');
  const snapshot={
    auditorAssignments:0,
    accessConfigured:false,
    paymentConfigured:false,
    activeAmenities:0,
    openAccountingPeriods:0,
    activeCommitteeTenures:0,
    governanceMeetings:0,
    evaluatedAt,
    ...input?.snapshot,
  };
  const migrationComplete=input?.migrationComplete??true;
  const migration={
    totalStages:8,
    committedStages:migrationComplete?8:3,
    blockedStages:input?.blockedStages??0,
    readyStages:input?.readyStages??0,
    complete:migrationComplete,
    nextStage:migrationComplete?null:'VEHICLE',
    stages:[
      {entityType:'BUILDING',status:'COMMITTED',committed:true,ready:false,blockedByDependency:false,blockers:[]},
      ...(migrationComplete?[]:[{entityType:'VEHICLE',status:(input?.blockedStages??0)>0?'BLOCKED':'PENDING',committed:false,ready:false,blockedByDependency:(input?.blockedStages??0)>0,blockers:(input?.blockedStages??0)>0?['Previous migration stage is not committed']:[]}]),
    ],
  };
  const prisma={
    building:{count:vi.fn().mockResolvedValue(input?.buildings??1)},
    societyMembership:{count:vi.fn().mockResolvedValue(input?.roles??1)},
    $queryRaw:vi.fn().mockResolvedValue([snapshot]),
  };
  const migrationService={readiness:vi.fn().mockResolvedValue(migration)};
  const entitlements={current:vi.fn().mockResolvedValue({productTier:'PREMIUM',enabledFeatures:input?.features??[]})};
  return {
    service:new OnboardingReadinessService(prisma as never,migrationService as never,entitlements as never),
    prisma,migrationService,entitlements,evaluatedAt,
  };
}

describe('V4.79.5 onboarding readiness intelligence',()=>{
  it('does not turn optional disabled modules into repository blockers',async()=>{
    const {service,evaluatedAt}=setup();
    const result=await service.readiness('society-1');
    expect(result.repositoryReady).toBe(true);
    expect(result.status).toBe('REPOSITORY_REVIEW_REQUIRED');
    expect(result.blockingStepIds).toEqual([]);
    expect(result.steps.find(step=>step.id==='amenities')).toMatchObject({state:'READY',blockers:[]});
    expect(result.steps.find(step=>step.id==='billing')).toMatchObject({state:'READY',blockers:[]});
    expect(result.productionizationClaim).toBe(false);
    expect(result.boundary).toContain('Hosted infrastructure');
    expect(result.evaluatedAt).toEqual(evaluatedAt);
  });

  it('derives blockers from authoritative core and enabled-module evidence',async()=>{
    const {service}=setup({
      buildings:0,
      roles:0,
      migrationComplete:false,
      blockedStages:1,
      features:[ProductFeature.AMENITIES,ProductFeature.SOCIETY_ACCOUNTING,ProductFeature.PAYMENTS],
      snapshot:{activeAmenities:0,openAccountingPeriods:0,paymentConfigured:false},
    });
    const result=await service.readiness('society-1');
    expect(result.repositoryReady).toBe(false);
    expect(result.status).toBe('ACTION_REQUIRED');
    expect(result.blockingStepIds).toEqual(expect.arrayContaining(['property','migration','roles','amenities','billing']));
    expect(result.steps.find(step=>step.id==='migration')?.blockers.join(' ')).toContain('Previous migration stage');
    expect(result.steps.find(step=>step.id==='billing')?.nextActions.join(' ')).toContain('payment-gateway');
  });

  it('keeps access and governance acceptance review-only rather than fabricating production readiness',async()=>{
    const {service}=setup({
      snapshot:{accessConfigured:true,activeCommitteeTenures:2,governanceMeetings:1},
    });
    const result=await service.readiness('society-1');
    expect(result.steps.find(step=>step.id==='gate')).toMatchObject({state:'READY',blockers:[]});
    expect(result.steps.find(step=>step.id==='policy')).toMatchObject({state:'REVIEW',blockers:[]});
    expect(result.steps.find(step=>step.id==='policy')?.nextActions.join(' ')).toContain('bye-law');
    expect(result.productionizationClaim).toBe(false);
  });
});
