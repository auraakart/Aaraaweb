import { randomUUID } from 'node:crypto';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { BearerGuard } from '../auth/bearer.guard';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ProductFeature } from './entitlement.types';
import { PartnerLicenseLifecycleController } from './partner-license-lifecycle.controller';
import { PartnerLicenseLifecycleService } from './partner-license-lifecycle.service';
const societyId=randomUUID(),maker=randomUUID(),checker=randomUUID(),grantId=randomUUID(),partnerId=randomUUID(),consentId=randomUUID(),approvalId=randomUUID();
const enabled=[ProductFeature.VISITOR_MANAGEMENT,ProductFeature.NOTICES,ProductFeature.SOS];
const principal={userId:checker,societyId,roles:[AppRole.SUPER_ADMIN]};
const context={grantId,expectedGrantVersion:1,expectedOwnershipVersion:1,idempotencyKey:randomUUID()};
const approval={...context,reason:'Approved safe commercial license',essentialPolicy:'PRESERVE_LEGACY' as const};
function fixture(){
 const g={id:grantId,partnerId,createdById:maker,version:1,status:'DRAFT',startsAt:new Date(Date.now()-60000),endsAt:new Date(Date.now()+3600000),graceUntil:null,
  planRevision:{featureAllowlist:Object.values(ProductFeature),maximumSocieties:1,maximumDistributions:1},approval:null as unknown};
 const consent={id:consentId,societyId,grantId,grantVersion:1,ownershipVersion:1,actorId:checker,decision:'OPT_IN',sequence:1,idempotencyKey:context.idempotencyKey,productTier:'STARTER',featureOverrides:{},enabledFeatures:enabled};
 const tx={
  $queryRaw:vi.fn(async(p:TemplateStringsArray)=>p.join('').includes('FROM "Partner"')?[{status:'ACTIVE'}]:p.join('').includes('FROM "User"')?[{id:maker}]:p.join('').includes('aaraagate_v5454_used')?[{used:0}]:[]),
  partnerLicenseGrant:{findFirst:vi.fn().mockResolvedValue(g)},
  society:{findUniqueOrThrow:vi.fn().mockResolvedValue({productTier:'STARTER',featureOverrides:{}})},
  partnerLicenseApproval:{findFirst:vi.fn().mockResolvedValue(null),create:vi.fn().mockResolvedValue({id:approvalId})},
  partnerLicenseRevocation:{create:vi.fn().mockResolvedValue({id:'revocation'})},
  societyLicenseConsent:{findFirst:vi.fn().mockResolvedValue(consent),findUnique:vi.fn().mockResolvedValue(null),create:vi.fn().mockResolvedValue({id:consentId,decision:'OPT_IN',sequence:1})},
  societyEntitlementCompatibility:{findUnique:vi.fn().mockResolvedValue({sourceMigration:'v5-cutover'})},
  societyLicenseAllocation:{findFirst:vi.fn().mockResolvedValue({id:grantId}),findUnique:vi.fn().mockResolvedValue(null),create:vi.fn().mockResolvedValue({id:'allocation'})},
  societyOwnershipTransfer:{findUnique:vi.fn()},
 };
 const run=vi.fn(async(_p:unknown,_id:string,cb:(client:typeof tx,owner:{partnerId:string;ownershipVersion:number})=>Promise<unknown>)=>cb(tx,{partnerId,ownershipVersion:1}));
 const ownership={withAuthorizedSociety:run,withConsentAuthority:run};
 const entitlements={current:vi.fn().mockResolvedValue({enabledFeatures:enabled})};
 return {g,consent,tx,ownership,entitlements,service:new PartnerLicenseLifecycleService(ownership as never,entitlements as never)};
}
const approved=()=>({id:approvalId,grantVersion:1,approvedById:checker,societyId,ownershipVersion:1,idempotencyKey:context.idempotencyKey,reason:approval.reason,revocation:null});
afterEach(()=>vi.useRealTimers());
describe('V5.4.5.4 immutable approval and legacy opt-in',()=>{
 it('requires bearer + platform roles for activation and allows society admins only for explicit consent',()=>{
  expect(Reflect.getMetadata(GUARDS_METADATA,PartnerLicenseLifecycleController)).toEqual([BearerGuard,RolesGuard]);
  expect(Reflect.getMetadata(ROLES_KEY,PartnerLicenseLifecycleController)).toEqual([AppRole.SUPER_ADMIN]);
  expect(Reflect.getMetadata(ROLES_KEY,PartnerLicenseLifecycleController.prototype.consent)).toEqual([AppRole.SOCIETY_ADMIN,AppRole.SUPER_ADMIN]);
  expect(Reflect.getMetadata(ROLES_KEY,PartnerLicenseLifecycleController.prototype.activate)).toBeUndefined();
 });
 it('validates policy and input before any data access',async()=>{
  const f=fixture();
  await expect(f.service.approve(principal,societyId,{...approval,essentialPolicy:'DISABLE' as never})).rejects.toThrow(/continuity/);
  await expect(f.service.approve(principal,societyId,{...approval,idempotencyKey:'bad'})).rejects.toThrow(/Invalid/);
  expect(f.ownership.withAuthorizedSociety).not.toHaveBeenCalled();
 });
 it('requires independent maker/checker and records only an immutable approval',async()=>{
  const f=fixture();
  await expect(f.service.approve({...principal,userId:maker},societyId,approval)).rejects.toThrow(/Independent/);
  expect(await f.service.approve(principal,societyId,approval)).toEqual({id:approvalId,status:'APPROVED',grantVersion:1});
  expect(f.tx.partnerLicenseApproval.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({approvedById:checker,essentialPolicy:'PRESERVE_LEGACY'})}));
 });
 it('rejects overlapping licenses and a feature-removing plan',async()=>{
  const f=fixture();f.tx.partnerLicenseApproval.findFirst.mockResolvedValueOnce({id:'existing'});
  await expect(f.service.approve(principal,societyId,approval)).rejects.toThrow(/overlap/);
  f.g.planRevision.featureAllowlist=[];
  await expect(f.service.approve(principal,societyId,approval)).rejects.toThrow(/remove enabled/);
 });
 it('rejects an expired/revoked approval replay',async()=>{
  const f=fixture();f.g.approval=approved();
  expect(await f.service.approve(principal,societyId,approval)).toMatchObject({status:'APPROVED'});
  f.g.approval={...approved(),revocation:{id:'revoked'}};
  await expect(f.service.approve(principal,societyId,approval)).rejects.toThrow(/revoked/);
  f.g.endsAt=new Date(Date.now()-1);
  await expect(f.service.approve(principal,societyId,approval)).rejects.toThrow(/period ended/);
 });
 it('snapshots exact legacy tier/overrides/features without altering live authority',async()=>{
  const f=fixture();f.tx.societyLicenseConsent.findFirst.mockResolvedValue(null);
  await f.service.consent(principal,societyId,{...context,decision:'OPT_IN',expectedFeatures:enabled});
  expect(f.tx.societyLicenseConsent.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({productTier:'STARTER',featureOverrides:{},enabledFeatures:enabled,compatibilityMigration:'v5-cutover'})}));
  await expect(f.service.consent(principal,societyId,{...context,decision:'OPT_IN',expectedFeatures:[]})).rejects.toThrow(/expectation changed/);
 });
 it('records withdrawal even after compatibility drift instead of rewriting old opt-in',async()=>{
  const f=fixture();f.entitlements.current.mockResolvedValue({enabledFeatures:[]});
  f.g.approval={...approved(),revocation:{id:'revoked'}};f.g.endsAt=new Date(Date.now()-1);
  await expect(f.service.consent(principal,societyId,{...context,decision:'WITHDRAW',expectedFeatures:[]})).resolves.toMatchObject({id:consentId});
 });
 it('activates compatible current opt-in and rejects absence/withdrawal',async()=>{
  const f=fixture();f.g.approval=approved();
  expect(await f.service.activate(principal,societyId,{...context,consentId})).toEqual({id:'allocation',status:'ACTIVE_ALLOCATION',consentId});
  f.tx.societyLicenseConsent.findFirst.mockResolvedValueOnce({...f.consent,decision:'WITHDRAW'});
  await expect(f.service.activate(principal,societyId,{...context,consentId})).rejects.toThrow(/current.*opt-in/i);
 });
 it('revalidates approval, clock and raw legacy snapshot before receipt replay',async()=>{
  const f=fixture();f.g.approval=approved();
  f.tx.societyLicenseAllocation.findUnique.mockResolvedValue({id:'receipt',actorId:checker,societyId,ownershipVersion:1,consentId});
  expect(await f.service.activate(principal,societyId,{...context,consentId})).toMatchObject({id:'receipt'});
  f.tx.society.findUniqueOrThrow.mockResolvedValueOnce({productTier:'STARTER',featureOverrides:{unrecognized:true}});
  await expect(f.service.activate(principal,societyId,{...context,consentId})).rejects.toThrow(/opt-in/);
  vi.useFakeTimers();vi.setSystemTime(new Date(f.g.endsAt.getTime()+1));
  await expect(f.service.activate(principal,societyId,{...context,consentId})).rejects.toThrow(/active license/);
  expect(f.tx.societyLicenseAllocation.create).not.toHaveBeenCalled();
 });
 it('denies zero capacity and mismatched actor replay',async()=>{
  const f=fixture();f.g.approval=approved();f.g.planRevision.maximumSocieties=0;
  await expect(f.service.activate(principal,societyId,{...context,consentId})).rejects.toThrow(/exhausted/);
  f.tx.societyLicenseAllocation.findUnique.mockResolvedValueOnce({id:'receipt',actorId:maker,societyId,ownershipVersion:1,consentId});
  await expect(f.service.activate(principal,societyId,{...context,consentId})).rejects.toThrow(/key changed/);
 });
 it('rechecks active allocation, latest consent and raw features before downstream commercial work',async()=>{
  const f=fixture();f.g.approval=approved();const operation=vi.fn().mockResolvedValue('authorized');
  const input={...context,allocationId:grantId};
  expect(await f.service.withActiveAllocation(principal,societyId,input,operation)).toBe('authorized');
  expect(operation).toHaveBeenCalledWith(f.tx,expect.objectContaining({maximumDistributions:1}));
  f.tx.societyLicenseAllocation.findFirst.mockResolvedValueOnce(null);
  await expect(f.service.withActiveAllocation(principal,societyId,input,operation)).rejects.toThrow(/allocation/);
  f.tx.societyLicenseConsent.findFirst.mockResolvedValueOnce({...f.consent,decision:'WITHDRAW'});
  await expect(f.service.withActiveAllocation(principal,societyId,input,operation)).rejects.toThrow(/opt-in/);
  f.g.approval={...approved(),revocation:{id:'revoked'}};
  await expect(f.service.withActiveAllocation(principal,societyId,input,operation)).rejects.toThrow(/active license/);
  expect(operation).toHaveBeenCalledTimes(1);
 });

});
