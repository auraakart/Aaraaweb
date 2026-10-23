import { createHash } from 'node:crypto';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { PartnerBrandService,partnerBrandConfig,mergePartnerPresentation } from './partner-brand.service';
import { PartnerApplicationService } from './partner-application.service';
import { activePartnerAllocation } from './active-partner-allocation';
import { assertApplicationSociety } from '../auth/partner-application-binding';
import { canonicalLicenseJson } from '../entitlements/partner-license-lifecycle.service';
import { TIER_FEATURES,ProductTier,ProductFeature } from '../entitlements/entitlement.types';
const partnerId='11111111-1111-4111-8111-111111111111',societyId='22222222-2222-4222-8222-222222222222',actor='33333333-3333-4333-8333-333333333333',appId='44444444-4444-4444-8444-444444444444';
const hash=(v:unknown)=>createHash('sha256').update(canonicalLicenseJson(v)).digest('hex');
const config={presentation:{displayName:'Partner One',colors:{primary:'#155E75',primaryDeep:'#164E63'}},societyOverrideFields:['support','logoAssetId']};
function fixture(){
 const grant={id:'grant',version:1,planRevision:{featureAllowlist:Object.values(ProductFeature)}};
 const allocation={id:'allocation',consentId:'consent',approval:{grantVersion:1,grant}};
 const consent={id:'consent',decision:'OPT_IN',grantVersion:1,productTier:'STARTER',featureOverrides:{},enabledFeatures:TIER_FEATURES[ProductTier.STARTER]};
 const published={id:'brand',version:1,config,digest:hash(config),publishedAt:new Date(),createdById:actor};
 const app={id:appId,partnerId,applicationId:'in.fixture.partner.resident',appRole:'RESIDENT' as const,signerFingerprint:'f'.repeat(64)};
 const tx={
  $queryRaw:vi.fn().mockResolvedValue([{id:actor}]),
  partnerMembership:{findFirst:vi.fn().mockResolvedValue({id:'member'})},
  partnerBrandRevision:{findFirst:vi.fn().mockResolvedValue(published),findMany:vi.fn().mockResolvedValue([published]),create:vi.fn().mockResolvedValue({version:2}),update:vi.fn().mockResolvedValue({})},
  society:{findFirst:vi.fn().mockResolvedValue({id:societyId,partnerId,ownershipVersion:1,productTier:'STARTER',featureOverrides:{}})},
  societyLicenseAllocation:{findMany:vi.fn().mockResolvedValue([allocation])},
  societyLicenseConsent:{findFirst:vi.fn().mockResolvedValue(consent)},
  partnerApplication:{findUnique:vi.fn().mockResolvedValue(app),findFirst:vi.fn().mockResolvedValue(app),create:vi.fn().mockResolvedValue(app),count:vi.fn().mockResolvedValue(0)},
  partnerApplicationScope:{findMany:vi.fn().mockResolvedValue([{id:'scope',allocationId:'allocation'}]),findFirst:vi.fn().mockResolvedValue({id:'scope',createdById:'other',approvedById:null,revokedAt:null}),findUnique:vi.fn().mockResolvedValue(null),create:vi.fn().mockResolvedValue({id:'scope'}),update:vi.fn().mockResolvedValue({approved:true}),updateMany:vi.fn().mockResolvedValue({count:1})},
  partnerDistributionProposal:{findUnique:vi.fn().mockResolvedValue(null)},
 };
 const prisma={$transaction:vi.fn(async(op:(client:typeof tx)=>unknown)=>op(tx)),withTenantContext:vi.fn(async(_society:string,op:(client:typeof tx)=>unknown)=>op(tx))};
 const brands=new PartnerBrandService(prisma as never);
 const licenses={withActiveAllocation:vi.fn(async(_p:unknown,_s:string,_i:unknown,op:(client:typeof tx,scope:unknown)=>unknown)=>op(tx,{partnerId}))};
 const ownership={withAuthorizedSociety:vi.fn(async(_p:unknown,_s:string,op:(client:typeof tx,scope:unknown)=>unknown)=>op(tx,{partnerId}))};
 const applications=new PartnerApplicationService(prisma as never,brands,licenses as never,ownership as never);
 return {tx,prisma,brands,applications,published,consent,allocation,app};
}
afterEach(()=>vi.unstubAllEnvs());
describe('V5.9 partner presentation and application authority',()=>{
 it('validates presentation and override policy without accepting private society assets or permissions',()=>{
  expect(partnerBrandConfig(config).presentation.displayName).toBe('Partner One');
  for(const input of [{...config,roles:['OWNER']},{...config,societyOverrideFields:['roles']},{...config,societyOverrideFields:['colors','colors']},{...config,presentation:{logoAssetId:appId}}])expect(()=>partnerBrandConfig(input)).toThrow();
 });
 it('preserves locked partner fields while applying permitted society presentation',()=>{
  const result=mergePartnerPresentation(partnerBrandConfig(config),{displayName:'Society Override',colors:{primary:'#000000',primaryDeep:'#FFFFFF'},support:{phone:'+919876543210'},logoAssetId:appId});
  expect(result).toMatchObject({displayName:'Partner One',colors:config.presentation.colors,support:{phone:'+919876543210'},logoAssetId:appId});
 });
 it('denies revoked commercial editors and stale version writes',async()=>{
  const f=fixture();f.tx.partnerMembership.findFirst.mockResolvedValue(null);
  await expect(f.brands.draft(actor,partnerId,1,config)).rejects.toThrow(/unavailable/);
  expect(f.tx.partnerBrandRevision.create).not.toHaveBeenCalled();
  f.tx.partnerMembership.findFirst.mockResolvedValue({id:'member'});
  await expect(f.brands.draft(actor,partnerId,0,config)).rejects.toThrow(/changed/);
 });
 it('publishes only an intact newer draft with publisher and reason',async()=>{
  const f=fixture(),draft={...f.published,id:'draft',version:2,publishedAt:null};
  f.tx.partnerBrandRevision.findFirst.mockResolvedValueOnce(f.published).mockResolvedValueOnce(draft as never);
  await expect(f.brands.publish(actor,partnerId,'draft',1,'Reviewed presentation')).resolves.toMatchObject({published:true});
  expect(f.tx.partnerBrandRevision.update).toHaveBeenCalledWith({where:{id:'draft'},data:{publishedAt:expect.any(Date),publishedById:actor,reason:'Reviewed presentation'}});
  f.tx.partnerBrandRevision.findFirst.mockResolvedValueOnce(f.published).mockResolvedValueOnce({...draft,digest:'0'.repeat(64)} as never);
  await expect(f.brands.publish(actor,partnerId,'draft',1,'Reviewed')).rejects.toThrow(/digest/);
 });
 it('uses only a current opted-in compatible allocation for runtime inheritance',async()=>{
  const f=fixture(),society={id:societyId,partnerId,ownershipVersion:1};
  expect(await f.brands.resolve(f.tx as never,society,{displayName:'Society'})).toMatchObject({partnerVersion:1,config:{displayName:'Partner One'}});
  f.consent.decision='WITHDRAW';
  expect(await f.brands.resolve(f.tx as never,society,{displayName:'Society'})).toEqual({partnerVersion:0,config:{displayName:'Society'}});
 });
 it('rejects stale consent, changed legacy features, approval versions and ambiguous allocations',async()=>{
  const f=fixture();
  expect(await activePartnerAllocation(f.tx as never,societyId,partnerId,1)).toBeTruthy();
  f.consent.id='new-consent';expect(await activePartnerAllocation(f.tx as never,societyId,partnerId,1)).toBeNull();
  f.consent.id='consent';f.consent.featureOverrides={unexpected:true} as never;expect(await activePartnerAllocation(f.tx as never,societyId,partnerId,1)).toBeNull();
  f.consent.featureOverrides={};f.allocation.approval.grantVersion=2;expect(await activePartnerAllocation(f.tx as never,societyId,partnerId,1)).toBeNull();
  f.tx.societyLicenseAllocation.findMany.mockResolvedValue([f.allocation,f.allocation]);expect(await activePartnerAllocation(f.tx as never,societyId,partnerId,1)).toBeNull();
 });
 it('enforces TEST gating, application role and current partner/society scope',async()=>{
  const f=fixture();vi.stubEnv('NODE_ENV','test');vi.stubEnv('AARAGATE_ENABLE_TEST_APP_SESSIONS','true');
  await expect(assertApplicationSociety(f.prisma as never,appId,societyId,[AppRole.OWNER])).resolves.toMatchObject({id:appId});
  await expect(assertApplicationSociety(f.prisma as never,appId,societyId,[AppRole.SECURITY_GUARD])).rejects.toThrow(/role/);
  f.app.partnerId=societyId;await expect(assertApplicationSociety(f.prisma as never,appId,societyId,[AppRole.OWNER])).rejects.toThrow(/unavailable/);
  vi.stubEnv('NODE_ENV','production');await expect(assertApplicationSociety(f.prisma as never,appId,societyId,[AppRole.OWNER])).rejects.toThrow(/unavailable/);
 });
 it('rejects withdrawn scope and preserves immutable application identity',async()=>{
  const f=fixture();vi.stubEnv('NODE_ENV','test');vi.stubEnv('AARAGATE_ENABLE_TEST_APP_SESSIONS','true');
  f.tx.partnerApplicationScope.findMany.mockResolvedValue([]);
  await expect(assertApplicationSociety(f.prisma as never,appId,societyId,[AppRole.OWNER])).rejects.toThrow(/allocation/);
  await expect(f.applications.register(actor,partnerId,{...f.app,signerFingerprint:'0'.repeat(64)})).rejects.toThrow(/reserved/);
 });
 it('preserves existing operational rights after commercial withdrawal but refuses new bindings',async()=>{
  const f=fixture();vi.stubEnv('NODE_ENV','test');vi.stubEnv('AARAGATE_ENABLE_TEST_APP_SESSIONS','true');f.consent.decision='WITHDRAW';
  await expect(assertApplicationSociety(f.prisma as never,appId,societyId,[AppRole.OWNER])).rejects.toThrow(/allocation/);
  await expect(assertApplicationSociety(f.prisma as never,appId,societyId,[AppRole.OWNER],'OPERATE')).resolves.toMatchObject({id:appId});
  f.tx.partnerApplicationScope.findMany.mockResolvedValue([]);
  await expect(assertApplicationSociety(f.prisma as never,appId,societyId,[AppRole.OWNER],'OPERATE')).rejects.toThrow(/allocation/);
 });
 it('requires independent current maker authority for society scope approval',async()=>{
  const f=fixture(),principal={userId:actor,societyId,roles:[AppRole.SUPER_ADMIN]},context={grantId:appId,allocationId:appId,expectedGrantVersion:1,expectedOwnershipVersion:1,idempotencyKey:appId};
  f.tx.partnerApplicationScope.findFirst.mockResolvedValue({id:'scope',createdById:actor,approvedById:null,revokedAt:null});
  await expect(f.applications.approveScope(principal,societyId,appId,'scope',context)).rejects.toThrow(/Independent/);
  f.tx.partnerApplicationScope.findFirst.mockResolvedValue({id:'scope',createdById:'other',approvedById:null,revokedAt:null});f.tx.$queryRaw.mockResolvedValue([]);
  await expect(f.applications.approveScope(principal,societyId,appId,'scope',context)).rejects.toThrow(/proposer/);
 });
});
