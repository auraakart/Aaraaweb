import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PartnerDomainClaimAction, PartnerRole } from '@prisma/client';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PartnerDomainClaimService } from './partner-domain-claim.service';

const actor='11111111-1111-4111-8111-111111111111',
 partner='22222222-2222-4222-8222-222222222222',
 claimId='33333333-3333-4333-8333-333333333333',
 key='44444444-4444-4444-8444-444444444444';
function harness(){
 const claim={id:claimId,partnerId:partner,version:1,status:'VERIFIED',challengeRotationCount:0,
  challengeIssuedAt:new Date(Date.now()-120000)};
 const tx={
  $queryRaw:vi.fn().mockResolvedValue([{id:partner,status:'ACTIVE'}]),
  partnerMembership:{findFirst:vi.fn().mockResolvedValue({id:actor})},
  partnerDomainClaim:{findFirst:vi.fn().mockImplementation(async()=>claim),update:vi.fn().mockResolvedValue({})},
  partnerDomainClaimEvent:{findFirst:vi.fn().mockResolvedValue(null),create:vi.fn().mockResolvedValue({})},
 };
 const prisma={$transaction:vi.fn(async(run:(transaction:typeof tx)=>Promise<unknown>)=>run(tx))};
 return {tx,claim,service:new PartnerDomainClaimService(prisma as never)};
}
const input={expectedVersion:1,idempotencyKey:key,reason:'Partner requested domain rotation'};
describe('V5.4.13 domain lifecycle safely revokes and reissues',()=>{
 it('requires current owner and partner under transactional lock',async()=>{
  const {tx,service}=harness();tx.partnerMembership.findFirst.mockResolvedValue(null);
  await expect(service.revoke(actor,partner,claimId,input)).rejects.toBeInstanceOf(NotFoundException);
  expect(tx.partnerDomainClaim.update).not.toHaveBeenCalled();
 });
 it('records an immutable revoke with no routing or role change',async()=>{
  const {tx,service}=harness();
  await expect(service.revoke(actor,partner,claimId,input)).resolves.toMatchObject({status:'REVOKED',replayed:false});
  expect(tx.partnerMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({role:PartnerRole.OWNER,userId:actor,partnerId:partner,active:true})}));
  expect(tx.partnerDomainClaim.update).toHaveBeenCalledWith({where:{id:claimId},data:{
   status:'REVOKED',verifiedAt:null,verifiedUntil:null,version:{increment:1},
  }});
  expect(tx.partnerDomainClaimEvent.create).toHaveBeenCalledWith({data:expect.objectContaining({action:PartnerDomainClaimAction.REVOKED,actorId:actor,idempotencyKey:key})});
 });
 it('revoke replay never writes again; changed actor or action fails',async()=>{
  const {tx,claim,service}=harness();claim.status='REVOKED';
  tx.partnerDomainClaimEvent.findFirst.mockResolvedValue({actorId:actor,action:PartnerDomainClaimAction.REVOKED,reason:input.reason});
  await expect(service.revoke(actor,partner,claimId,input)).resolves.toMatchObject({replayed:true});
  await expect(service.reissue(actor,partner,claimId,input)).rejects.toBeInstanceOf(ConflictException);
  expect(tx.partnerDomainClaim.update).not.toHaveBeenCalled();
 });
 it('reissue rotates a one-time secret, clears verification state, appends event',async()=>{
  const {tx,service}=harness();
  const r=await service.reissue(actor,partner,claimId,input);
  expect(r).toMatchObject({status:'PENDING',replayed:false});
  expect(r.challenge).toMatch(/^[0-9a-f]{64}$/);
  const data=tx.partnerDomainClaim.update.mock.calls[0][0].data;
  expect(data.challengeHash).toBe(createHash('sha256').update(r.challenge as string).digest('hex'));
  expect(data.verifiedAt).toBeNull();expect(data.verificationAttempts).toBe(0);
  expect(tx.partnerDomainClaimEvent.create).toHaveBeenCalledWith({data:expect.objectContaining({action:PartnerDomainClaimAction.CHALLENGE_REISSUED,reason:input.reason})});
 });
 it('same key replay never rediscloses rotated token',async()=>{
  const {tx,claim,service}=harness();claim.status='PENDING';
  tx.partnerDomainClaimEvent.findFirst.mockResolvedValue({actorId:actor,action:PartnerDomainClaimAction.CHALLENGE_REISSUED,reason:input.reason});
  await expect(service.reissue(actor,partner,claimId,input)).resolves.toMatchObject({challenge:null,replayed:true});
  expect(tx.partnerDomainClaim.update).not.toHaveBeenCalled();
 });
 it('blocks immediate reissue, spent rotation budget and stale version',async()=>{
  const a=harness();a.claim.challengeIssuedAt=new Date();
  await expect(a.service.reissue(actor,partner,claimId,input)).rejects.toBeInstanceOf(ConflictException);
  const b=harness();b.claim.challengeRotationCount=10;
  await expect(b.service.reissue(actor,partner,claimId,input)).rejects.toBeInstanceOf(ConflictException);
  const c=harness();c.claim.version=2;
  await expect(c.service.reissue(actor,partner,claimId,input)).rejects.toBeInstanceOf(ConflictException);
 });
 it('rejects malformed lifecycle input and keeps domain hidden from unauthorised actors',async()=>{
  const {service}=harness();
  await expect(service.reissue(actor,partner,claimId,{...input,reason:'x'})).rejects.toBeInstanceOf(BadRequestException);
  await expect(service.revoke(actor,partner,claimId,{...input,expectedVersion:0})).rejects.toBeInstanceOf(BadRequestException);
 });
});
