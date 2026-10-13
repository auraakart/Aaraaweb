import test from 'node:test';
import assert from 'node:assert/strict';
import {
  simulatePartnerCapacityReservation, assessLegacyLicenseCutover,
} from '../packages/types/src/partner-license-allocation-simulation.mjs';

const partnerA='11111111-1111-4111-8111-111111111111';
const partnerB='22222222-2222-4222-8222-222222222222';
const plan='33333333-3333-4333-8333-333333333333';
const societyA='44444444-4444-4444-8444-444444444444';
const societyB='55555555-5555-4555-8555-555555555555';
const receipt='66666666-6666-4666-8666-666666666666';
const receiptB='77777777-7777-4777-8777-777777777777';
const initial=()=>({partnerId:partnerA,planRevisionId:plan,
  maximumSocieties:1,allocationVersion:3,allocatedSocietyIds:[],receipts:[]});
const request=(overrides={})=>({
  partnerId:partnerA,ownerPartnerId:partnerA,planRevisionId:plan,
  societyId:societyA,idempotencyKey:receipt,
  ownershipVersion:2,expectedOwnershipVersion:2,expectedAllocationVersion:3,
  partnerStatus:'ACTIVE',licensePhase:'ACTIVE',
  auditedOwnershipTransfer:true,explicitCommercialApproval:true,...overrides,
});

test('V5.4.5.1 simulates reservation and deterministic exact-key replay without mutation',()=>{
  const before=initial(),req=request();
  const first=simulatePartnerCapacityReservation(before,req);
  assert.equal(first.outcome,'RESERVED_IN_SIMULATION');
  assert.equal(first.allocationVersion,4);
  assert.deepEqual(before.allocatedSocietyIds,[]);
  assert.equal(first.state.allocatedSocietyIds[0],societyA);
  const replay=simulatePartnerCapacityReservation(first.state,req);
  assert.equal(replay.outcome,'REPLAYED');
  assert.equal(replay.allocationVersion,4);
  assert.strictEqual(replay.state,first.state);
  assert.throws(()=>simulatePartnerCapacityReservation(first.state,
    request({societyId:societyB})),/Idempotency conflict/);
});

test('two stale parallel candidates cannot both reserve capacity in sequential optimistic simulation',()=>{
  const before=initial();
  const first=simulatePartnerCapacityReservation(before,request());
  assert.throws(()=>simulatePartnerCapacityReservation(first.state,
    request({societyId:societyB,idempotencyKey:receiptB})),/Allocation version conflict/);
  assert.throws(()=>simulatePartnerCapacityReservation(first.state,
    request({societyId:societyB,idempotencyKey:receiptB,expectedAllocationVersion:4})),
    /capacity exceeded/);
});

test('blocks wrong partner, stale ownership, revoked status, grace and expiry',()=>{
  for(const [overrides,pattern] of [
    [{ownerPartnerId:partnerB},/Cross-partner/],
    [{partnerId:partnerB,ownerPartnerId:partnerB},/Cross-partner/],
    [{ownershipVersion:3},/Ownership version/],
    [{planRevisionId:partnerB},/Plan revision/],
    [{partnerStatus:'RESTRICTED'},/Inactive partner/],
    [{licensePhase:'GRACE'},/no new allocations/],
    [{licensePhase:'EXPIRED'},/no new allocations/],
    [{auditedOwnershipTransfer:false},/Audited ownership/],
    [{explicitCommercialApproval:false},/Commercial allocation/],
  ]){
    assert.throws(()=>simulatePartnerCapacityReservation(initial(),request(overrides)),pattern);
  }
});

test('rejects oversubscription, negative or malformed versions and forged snapshots',()=>{
  assert.throws(()=>simulatePartnerCapacityReservation(
    {...initial(),maximumSocieties:0},request()),/capacity exceeded/);
  assert.throws(()=>simulatePartnerCapacityReservation(
    {...initial(),allocationVersion:-1},request()),/Invalid version/);
  assert.throws(()=>simulatePartnerCapacityReservation(
    {...initial(),allocatedSocietyIds:[societyA,societyA]},request()),/Invalid allocated/);
  assert.throws(()=>simulatePartnerCapacityReservation(
    {...initial(),receipts:[{key:receipt,identity:'x',societyId:societyB},
      {key:receipt,identity:'x',societyId:societyB}]},request()),/Duplicate receipt/);
  assert.throws(()=>simulatePartnerCapacityReservation(initial(),
    request({idempotencyKey:'not-uuid'})),/Invalid commercial identity/);
});

test('legacy subscription features stay unchanged absent explicit reviewed cutover',()=>{
  const historical=['VISITOR_MANAGEMENT','SOS','NOTICES'];
  const noApproval=assessLegacyLicenseCutover({
    historicalFeatures:historical,currentFeatures:historical,
    proposedFeatures:['SOS','VISITOR_MANAGEMENT'],
    explicitSocietyOptIn:false,auditedOwnershipTransfer:false,
    essentialOperationsApproved:false,
  });
  assert.equal(noApproval.eligibleForFutureReviewedCutover,false);
  assert.deepEqual(noApproval.unchangedLegacyFeatures,historical);
  assert.ok(noApproval.blockers.includes('SOCIETY_CUTOVER_NOT_APPROVED'));
  assert.ok(noApproval.blockers.includes('OWNERSHIP_AUDIT_INCOMPLETE'));
  const drift=assessLegacyLicenseCutover({
    historicalFeatures:historical,currentFeatures:['SOS','NOTICES'],
    proposedFeatures:['SOS'],explicitSocietyOptIn:true,
    auditedOwnershipTransfer:true,essentialOperationsApproved:true,
  });
  assert.ok(drift.blockers.includes('LEGACY_ENTITLEMENT_DRIFT'));
  assert.ok(drift.blockers.includes('ESSENTIAL_FEATURE_REMOVED_VISITOR_MANAGEMENT'));
  assert.deepEqual(historical,['VISITOR_MANAGEMENT','SOS','NOTICES']);
});

test('approved hypothetical opt-in preserves already-enabled SOS and visitor access',()=>{
  const base={historicalFeatures:['SOS','VISITOR_MANAGEMENT','NOTICES'],
    currentFeatures:['NOTICES','VISITOR_MANAGEMENT','SOS'],
    proposedFeatures:['VISITOR_MANAGEMENT','SOS'],
    explicitSocietyOptIn:true,auditedOwnershipTransfer:true,
    essentialOperationsApproved:true};
  const candidate=assessLegacyLicenseCutover(base);
  assert.equal(candidate.eligibleForFutureReviewedCutover,true);
  assert.deepEqual(candidate.blockers,[]);
  assert.deepEqual(candidate.unchangedLegacyFeatures,base.currentFeatures);
  assert.equal(assessLegacyLicenseCutover({...base,
    proposedFeatures:['VISITOR_MANAGEMENT']}).eligibleForFutureReviewedCutover,false);
  assert.throws(()=>assessLegacyLicenseCutover({...base,
    currentFeatures:['SOS','SOS']}),/duplicate feature/);
});
