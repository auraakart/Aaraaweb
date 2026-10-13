import { GUARDS_METADATA } from '@nestjs/common/constants';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PartnerDomainClaimAction, PartnerRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PartnerBearerGuard } from '../auth/partner-bearer.guard';
import { PartnerDomainClaimService } from './partner-domain-claim.service';
import { PartnerDomainClaimController } from './partner-domain-claim.controller';

const owner='11111111-1111-4111-8111-111111111111';
const partner='22222222-2222-4222-8222-222222222222';
const key='33333333-3333-4333-8333-333333333333';
function harness(){
 const tx={
   $queryRaw:vi.fn().mockResolvedValue([{id:partner,status:'ACTIVE'}]),
   partnerMembership:{findFirst:vi.fn().mockResolvedValue({id:'owner'})},
   partnerDomainClaim:{
     findUnique:vi.fn().mockResolvedValue(null),
     findMany:vi.fn().mockResolvedValue([]),
     count:vi.fn().mockResolvedValue(0),
     create:vi.fn().mockResolvedValue({id:key,hostname:'partner.verified-owner.in',status:'PENDING'}),
   },
   partnerDomainClaimEvent:{create:vi.fn().mockResolvedValue({id:key})},
 };
 const db={$transaction:vi.fn(async(fn:(transaction:typeof tx)=>Promise<unknown>)=>fn(tx))};
 return {tx,db,service:new PartnerDomainClaimService(db as never)};
}
describe('V5.4.11 partner hostname claim is inert and actor scoped',()=>{
 it('uses a bearer session and never grants a society role',()=>{
   expect(Reflect.getMetadata(GUARDS_METADATA,PartnerDomainClaimController)).toContain(PartnerBearerGuard);
 });
 it('registers a bounded pending claim with hashed proof and immutable audit',async()=>{
   const {tx,service}=harness();
   const res=await service.register(owner,partner,{hostname:'partner.verified-owner.in',idempotencyKey:key});
   expect(res).toMatchObject({status:'PENDING',replayed:false});
   expect(res.challenge).toMatch(/^[0-9a-f]{64}$/);
   const data=tx.partnerDomainClaim.create.mock.calls[0][0].data;
   expect(data.challengeHash).toMatch(/^[0-9a-f]{64}$/);
   expect(data.challengeHash).not.toBe(res.challenge);
   expect(data.hostname).toBe('partner.verified-owner.in');
   expect(tx.partnerMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({
     where:expect.objectContaining({role:PartnerRole.OWNER,partnerId:partner,userId:owner,active:true}),
   }));
   expect(tx.partnerDomainClaimEvent.create).toHaveBeenCalledWith({data:{
     claimId:key,actorId:owner,action:PartnerDomainClaimAction.REGISTERED,
   }});
 });
 it('blocks foreign role before any registry read or write',async()=>{
   const {tx,service}=harness();tx.partnerMembership.findFirst.mockResolvedValue(null);
   await expect(service.register(owner,partner,{hostname:'partner.verified-owner.in',idempotencyKey:key})).rejects.toBeInstanceOf(NotFoundException);
   expect(tx.partnerDomainClaim.count).not.toHaveBeenCalled();
   expect(tx.partnerDomainClaim.create).not.toHaveBeenCalled();
 });
 it('rejects reserved, malformed or URL hostnames before database access',async()=>{
   const {db,service}=harness();
   for(const hostname of ['localhost','example.com','https://partner.example.in','127.0.0.1','*.acme.in']){
     await expect(service.register(owner,partner,{hostname,idempotencyKey:key})).rejects.toBeInstanceOf(BadRequestException);
   }
   expect(db.$transaction).not.toHaveBeenCalled();
 });
 it('idempotency never reveals the one-time DNS challenge again',async()=>{
   const {tx,service}=harness();
   tx.partnerDomainClaim.findUnique.mockResolvedValue({id:key,hostname:'partner.verified-owner.in',status:'PENDING',createdById:owner});
   await expect(service.register(owner,partner,{hostname:'partner.verified-owner.in',idempotencyKey:key}))
     .resolves.toEqual({id:key,hostname:'partner.verified-owner.in',status:'PENDING',challenge:null,replayed:true});
   expect(tx.partnerDomainClaim.create).not.toHaveBeenCalled();
   expect(tx.partnerDomainClaimEvent.create).not.toHaveBeenCalled();
 });
 it('rejects idempotency key hijack and exhausted claim quota',async()=>{
   const {tx,service}=harness();
   tx.partnerDomainClaim.findUnique.mockResolvedValueOnce({id:key,hostname:'other.in',status:'PENDING',createdById:owner});
   await expect(service.register(owner,partner,{hostname:'partner.verified-owner.in',idempotencyKey:key})).rejects.toBeInstanceOf(ConflictException);
   tx.partnerDomainClaim.count.mockResolvedValue(5);
   await expect(service.register(owner,partner,{hostname:'partner.verified-owner.in',idempotencyKey:key})).rejects.toBeInstanceOf(ConflictException);
   expect(tx.partnerDomainClaim.create).not.toHaveBeenCalled();
 });
 it('owner-only listing returns no token/hash or society operational records',async()=>{
   const {tx,service}=harness();await service.list(owner,partner);
   expect(tx.partnerDomainClaim.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where:{partnerId:partner},select:{id:true,hostname:true,status:true,createdAt:true,version:true},take:51,
   }));
 });
});
