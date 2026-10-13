import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PartnerDomainClaimAction, PartnerDomainClaimStatus, PartnerRole } from '@prisma/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { resolveTxt } from 'node:dns/promises';
import { createHash } from 'node:crypto';
import { PartnerDomainVerificationService } from './partner-domain-verification.service';
vi.mock('node:dns/promises',()=>({resolveTxt:vi.fn()}));
const actor='11111111-1111-4111-8111-111111111111';
const partner='22222222-2222-4222-8222-222222222222';
const claimId='33333333-3333-4333-8333-333333333333';
const challenge='f'.repeat(64);
const hash=createHash('sha256').update(challenge).digest('hex');
function harness(){
 const claim={id:claimId,partnerId:partner,hostname:'brand.partner.in',status:PartnerDomainClaimStatus.PENDING,
   createdAt:new Date(Date.now()-60000),challengeHash:hash,version:1,verificationAttempts:0,lastVerificationAttemptAt:null as Date|null};
 const tx={
  $queryRaw:vi.fn().mockResolvedValue([{id:partner,status:'ACTIVE'}]),
  partnerMembership:{findFirst:vi.fn().mockResolvedValue({id:'owner'})},
  partnerDomainClaim:{
   findFirst:vi.fn().mockImplementation(async()=>claim),
   update:vi.fn().mockImplementation(async({data}: {data:Record<string,unknown>})=>{
     if(typeof data.version==='number')claim.version=data.version;
     if(data.verificationAttempts)claim.verificationAttempts++;
     if(data.lastVerificationAttemptAt)claim.lastVerificationAttemptAt=data.lastVerificationAttemptAt as never;
     if(data.status)claim.status=data.status as never;
     return {};
   }),
   count:vi.fn().mockResolvedValue(0),
  },
  partnerLicenseGrant:{findMany:vi.fn().mockResolvedValue([{
   id:claimId,version:1,approval:{grantVersion:1},planRevision:{maximumDomains:2},
  }])},
  partnerDomainClaimEvent:{create:vi.fn().mockResolvedValue({})},
 };
 const db={$transaction:vi.fn(async(run:(transaction:typeof tx)=>Promise<unknown>)=>run(tx))};
 return {claim,tx,db,service:new PartnerDomainVerificationService(db as never)};
}
const env=process.env.AARAGATE_ENABLE_TEST_DOMAIN_VERIFICATION, previousNodeEnv=process.env.NODE_ENV;
beforeEach(()=>{process.env.AARAGATE_ENABLE_TEST_DOMAIN_VERIFICATION='true';process.env.NODE_ENV='test';vi.mocked(resolveTxt).mockResolvedValue([['aaraagate-domain-verification='+challenge]]);});
afterEach(()=>{if(env===undefined)delete process.env.AARAGATE_ENABLE_TEST_DOMAIN_VERIFICATION;else process.env.AARAGATE_ENABLE_TEST_DOMAIN_VERIFICATION=env;
 if(previousNodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousNodeEnv;vi.clearAllMocks();});
describe('V5.4.12 non-routing DNS TXT proof',()=>{
 it('requires explicitly enabled nonproduction environment',async()=>{
  const {db,service}=harness();process.env.NODE_ENV='production';
  await expect(service.verify(actor,partner,claimId,challenge)).rejects.toBeInstanceOf(NotFoundException);
  expect(db.$transaction).not.toHaveBeenCalled();
 });
 it('verifies TXT proof against stored digest and writes immutable event only with approved capacity',async()=>{
  const {tx,service}=harness();
  const result=await service.verify(actor,partner,claimId,challenge);
  expect(result).toMatchObject({status:'VERIFIED',routingActivated:false,hostname:'brand.partner.in'});
  expect(resolveTxt).toHaveBeenCalledWith('_aaraagate-challenge.brand.partner.in');
  expect(tx.partnerMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({
   role:PartnerRole.OWNER,userId:actor,partnerId:partner,active:true})}));
  expect(tx.partnerDomainClaimEvent.create).toHaveBeenCalledWith({data:{claimId,actorId:actor,action:PartnerDomainClaimAction.VERIFIED}});
 });
 it('does not query DNS for a wrong token, consuming a bounded attempt',async()=>{
  const {tx,service,claim}=harness();
  await expect(service.verify(actor,partner,claimId,'a'.repeat(64))).rejects.toBeInstanceOf(ConflictException);
  expect(claim.verificationAttempts).toBe(1);
  expect(resolveTxt).not.toHaveBeenCalled();
  expect(tx.partnerDomainClaimEvent.create).not.toHaveBeenCalled();
 });
 it('rejects malformed proof before any database access',async()=>{
  const {db,service}=harness();
  await expect(service.verify(actor,partner,claimId,'some-token')).rejects.toBeInstanceOf(BadRequestException);
  expect(db.$transaction).not.toHaveBeenCalled();
 });
 it('fails closed on absent TXT or resolver failure',async()=>{
  const {service}=harness();vi.mocked(resolveTxt).mockResolvedValueOnce([['wrong']]);
  await expect(service.verify(actor,partner,claimId,challenge)).rejects.toBeInstanceOf(ConflictException);
  const another=harness();vi.mocked(resolveTxt).mockRejectedValueOnce(new Error('NXDOMAIN'));
  await expect(another.service.verify(actor,partner,claimId,challenge)).rejects.toBeInstanceOf(ConflictException);
 });
 it('rejects a revoked owner before DNS or database writes',async()=>{
  const {tx,service}=harness();tx.partnerMembership.findFirst.mockResolvedValue(null);
  await expect(service.verify(actor,partner,claimId,challenge)).rejects.toBeInstanceOf(NotFoundException);
  expect(resolveTxt).not.toHaveBeenCalled();
  expect(tx.partnerDomainClaim.update).not.toHaveBeenCalled();
 });
 it('rejects missing license or exhausted domain capacity after valid DNS',async()=>{
  const {tx,service}=harness();tx.partnerLicenseGrant.findMany.mockResolvedValue([]);
  await expect(service.verify(actor,partner,claimId,challenge)).rejects.toBeInstanceOf(ConflictException);
  const h=harness();h.tx.partnerDomainClaim.count.mockResolvedValue(2);
  await expect(h.service.verify(actor,partner,claimId,challenge)).rejects.toBeInstanceOf(ConflictException);
  expect(h.tx.partnerDomainClaimEvent.create).not.toHaveBeenCalled();
 });
 it('prevents expired challenges, rapid retries and stale verification races',async()=>{
  const a=harness();a.claim.createdAt=new Date(Date.now()-8*24*60*60*1000);
  await expect(a.service.verify(actor,partner,claimId,challenge)).rejects.toBeInstanceOf(ConflictException);
  const b=harness();b.claim.lastVerificationAttemptAt=new Date();
  await expect(b.service.verify(actor,partner,claimId,challenge)).rejects.toBeInstanceOf(ConflictException);
  const c=harness();c.tx.partnerDomainClaim.findFirst.mockImplementationOnce(async()=>c.claim)
   .mockImplementationOnce(async()=>({...c.claim,version:999}));
  await expect(c.service.verify(actor,partner,claimId,challenge)).rejects.toBeInstanceOf(ConflictException);
 });
});
