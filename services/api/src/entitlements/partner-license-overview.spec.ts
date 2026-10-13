import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { ProductFeature } from './entitlement.types';
import { PartnerLicenseOverviewController } from './partner-license-overview.controller';
import { PartnerLicenseOverviewService } from './partner-license-overview.service';
const societyId=randomUUID(),partnerId=randomUUID(),maker=randomUUID(),checker=randomUUID(),grantId=randomUUID(),approvalId=randomUUID(),consentId=randomUUID();
const principal={userId:checker,societyId,roles:[AppRole.SUPER_ADMIN]},enabled=[ProductFeature.VISITOR_MANAGEMENT,ProductFeature.NOTICES,ProductFeature.SOS];
function fixture(){
 const grant={id:grantId,createdById:maker,version:1,startsAt:new Date(Date.now()-60000),endsAt:new Date(Date.now()+3600000),graceUntil:null,
  planRevision:{code:'TEST_PLAN',version:1,featureAllowlist:enabled,maximumSocieties:5,maximumDomains:1},approval:{id:approvalId,grantVersion:1,revocation:null}};
 const consent={id:consentId,grantVersion:1,productTier:'STARTER',featureOverrides:{},enabledFeatures:enabled,decision:'OPT_IN'};
 const tx={society:{findUniqueOrThrow:vi.fn().mockResolvedValue({name:'Selected society',productTier:'STARTER',featureOverrides:{}})},
  partner:{findUniqueOrThrow:vi.fn().mockResolvedValue({id:partnerId,displayName:'Selected partner',status:'ACTIVE'})},
  partnerLicenseGrant:{findMany:vi.fn().mockResolvedValue([grant])},societyLicenseConsent:{findFirst:vi.fn().mockResolvedValue(consent)},
  societyLicenseAllocation:{findUnique:vi.fn().mockResolvedValue({id:randomUUID(),ownershipVersion:1})},societyMembership:{findFirst:vi.fn().mockResolvedValue({id:'maker-membership'})},
  $queryRaw:vi.fn().mockResolvedValue([{used:1}])};
 const ownership={withConsentAuthority:vi.fn(async(_p:unknown,_s:string,cb:(client:typeof tx,owner:{partnerId:string;ownershipVersion:number})=>Promise<unknown>)=>cb(tx,{partnerId,ownershipVersion:1}))};
 const entitlements={current:vi.fn().mockResolvedValue({productTier:'STARTER',enabledFeatures:enabled})};
 return {grant,consent,tx,ownership,service:new PartnerLicenseOverviewService(ownership as never,entitlements as never)};
}
afterEach(()=>vi.unstubAllEnvs());
function registry(){return [{hostname:'homes.partner.community',partnerId,brandId:societyId,status:'VERIFIED',verifiedAt:new Date(Date.now()-60000).toISOString(),verifiedUntil:new Date(Date.now()+3600000).toISOString()}];}
function previewEnv(rows=registry()){vi.stubEnv('NODE_ENV','test');vi.stubEnv('AARAGATE_ENABLE_TEST_DOMAIN_PREVIEW','true');vi.stubEnv('AARAGATE_TEST_PARTNER_DOMAINS',JSON.stringify(rows));vi.stubEnv('AARAGATE_PLATFORM_HOSTNAMES','["platform.community"]');}
describe('V5.4.6 scoped licensing overview and test-only domain candidate',()=>{
 it('reuses selected-society authority and projects no maker/approver/other-society identities',async()=>{
  const f=fixture(),result=await f.service.overview(principal,societyId);
  expect(f.ownership.withConsentAuthority).toHaveBeenCalledWith(principal,societyId,expect.any(Function));
  expect(result.licenses[0].used).toBe(1);expect(result.licenses[0].allocation?.active).toBe(true);
  const json=JSON.stringify(result);expect(json).not.toContain(maker);expect(json).not.toContain(checker);expect(json).not.toContain('createdById');
 });
 it('does not expose partner-wide usage or platform capabilities to a society admin',async()=>{
  const f=fixture(),result=await f.service.overview({...principal,roles:[AppRole.SOCIETY_ADMIN]},societyId);
  expect(result.licenses[0]).toMatchObject({used:null,capabilities:{canApprove:false,canActivate:false,canRevoke:false}});
  expect(f.tx.partnerLicenseGrant.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({partnerId,OR:expect.arrayContaining([{approval:{isNot:null}}])})}));
  expect(f.tx.$queryRaw).not.toHaveBeenCalled();
 });
 it('rechecks platform-specific authority instead of trusting a stale bearer role',async()=>{
  const f=fixture();f.tx.societyMembership.findFirst.mockResolvedValueOnce(null);
  const result=await f.service.overview(principal,societyId);
  expect(result.licenses[0]).toMatchObject({used:null,capabilities:{canApprove:false,canRevoke:false,canActivate:false}});
 });
 it('pauses commercial allocation on withdrawal, expiry and legacy drift',async()=>{
  const f=fixture();f.consent.decision='WITHDRAW';expect((await f.service.overview(principal,societyId)).licenses[0].allocation?.active).toBe(false);
  f.consent.decision='OPT_IN';f.tx.society.findUniqueOrThrow.mockResolvedValueOnce({name:'Selected society',productTier:'STARTER',featureOverrides:{changed:true}});
  expect((await f.service.overview(principal,societyId)).licenses[0].snapshotMatches).toBe(false);
  f.grant.endsAt=new Date(Date.now()-1);expect((await f.service.overview(principal,societyId)).licenses[0].allocation?.active).toBe(false);
 });
 it('disables domain inspection by default and in production even with the opt-in flag',async()=>{
  const f=fixture();vi.stubEnv('AARAGATE_ENABLE_TEST_DOMAIN_PREVIEW','false');await expect(f.service.domainPreview(principal,societyId,'homes.partner.community')).rejects.toThrow(/unavailable/);
  previewEnv();vi.stubEnv('NODE_ENV','production');await expect(f.service.domainPreview(principal,societyId,'homes.partner.community')).rejects.toThrow(/unavailable/);
 });
 it('returns only a same-partner/same-society cosmetic test candidate',async()=>{
  previewEnv();const f=fixture();expect(await f.service.domainPreview(principal,societyId,'HOMES.PARTNER.COMMUNITY')).toEqual({hostname:'homes.partner.community',partnerId,societyId,testOnly:true,candidateOnly:true,routingActivated:false});
 });
 it('rejects foreign partner/society, expired and duplicate registry records',async()=>{
  const f=fixture();for(const rows of [registry().map(r=>({...r,partnerId:randomUUID()})),registry().map(r=>({...r,brandId:randomUUID()})),registry().map(r=>({...r,verifiedUntil:new Date(Date.now()-1).toISOString()})),[...registry(),...registry()]]){
   previewEnv(rows);await expect(f.service.domainPreview(principal,societyId,'homes.partner.community')).rejects.toThrow(/unavailable/);
  }
 });
 it('rejects unsafe host syntax and platform hostnames without trusting headers',async()=>{
  previewEnv();const f=fixture();for(const host of ['https://homes.partner.community','homes.partner.community:443','evil@homes.partner.community','localhost','platform.community'])await expect(f.service.domainPreview(principal,societyId,host)).rejects.toThrow(/unavailable/);
 });
 it('rejects revoked allocation and configured domain oversubscription',async()=>{
  previewEnv();const f=fixture();f.grant.approval.revocation={id:'revoked'} as never;
  await expect(f.service.domainPreview(principal,societyId,'homes.partner.community')).rejects.toThrow(/unavailable/);
  f.grant.approval.revocation=null;previewEnv([...registry(),...registry().map(r=>({...r,hostname:'second.partner.community'}))]);
  await expect(f.service.domainPreview(principal,societyId,'homes.partner.community')).rejects.toThrow(/unavailable/);
 });
 it('resolves test context only from raw Host and ignores forwarded host spoofing',async()=>{
  previewEnv();const f=fixture(),controller=new PartnerLicenseOverviewController(f.service);
  const good={auth:principal,header:(name:string)=>name==='host'?'homes.partner.community':'evil.partner.community'};
  expect(await controller.domainContext(good as never,societyId)).toMatchObject({hostname:'homes.partner.community',resolutionSource:'RAW_HOST',routingActivated:false});
  const forged={auth:principal,header:(name:string)=>name==='host'?'evil.partner.community':'homes.partner.community'};
  await expect(controller.domainContext(forged as never,societyId)).rejects.toThrow(/unavailable/);
  expect(()=>controller.domainContext({auth:principal,header:(name:string)=>name==='host'?undefined:'homes.partner.community'} as never,societyId)).toThrow(/unavailable/);
 });

});
