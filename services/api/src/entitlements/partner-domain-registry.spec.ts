import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PartnerDomainAction, PartnerDomainStatus, PartnerRole } from '@prisma/client';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { BearerGuard } from '../auth/bearer.guard';
import { PartnerDomainRegistryController } from './partner-domain-registry.controller';
import { PartnerDomainRegistryService } from './partner-domain-registry.service';

const actor='11111111-1111-4111-8111-111111111111',partner='22222222-2222-4222-8222-222222222222';
const domainId='33333333-3333-4333-8333-333333333333',key='44444444-4444-4444-8444-444444444444';
function harness(){
 const tx={
  $queryRaw:vi.fn().mockResolvedValue([{id:partner,status:'ACTIVE'}]),
  partnerMembership:{findFirst:vi.fn().mockResolvedValue({id:'owner'})},
  partnerDomainRegistration:{
   findUnique:vi.fn().mockResolvedValue(null),
   findFirst:vi.fn().mockResolvedValue(null),
   findMany:vi.fn().mockResolvedValue([]),
   create:vi.fn().mockResolvedValue({id:domainId,status:PartnerDomainStatus.PENDING}),
   update:vi.fn().mockResolvedValue({id:domainId,status:PartnerDomainStatus.VERIFIED,revision:2,verifiedUntil:new Date(Date.now()+86400000)}),
  },
  partnerDomainEvent:{create:vi.fn().mockResolvedValue({id:'event'})},
 };
 const prisma={$transaction:vi.fn(async (callback:(transaction:typeof tx)=>Promise<unknown>)=>callback(tx))};
 return {tx,prisma,service:new PartnerDomainRegistryService(prisma as never)};
}
beforeEach(()=>{
 process.env.NODE_ENV='test';
 process.env.AARAGATE_ENABLE_TEST_DOMAIN_REGISTRY='true';
 process.env.AARAGATE_PLATFORM_HOSTNAMES='["aaraagate.in","portal.aaraagate.in"]';
});
afterEach(()=>{
 delete process.env.AARAGATE_ENABLE_TEST_DOMAIN_REGISTRY;
 delete process.env.AARAGATE_PLATFORM_HOSTNAMES;
});
describe('V5.4.11 scoped persistent DNS verification registry',()=>{
 it('is bearer protected and never uses society super-admin roles',()=>{
  expect(Reflect.getMetadata(GUARDS_METADATA,PartnerDomainRegistryController)).toContain(BearerGuard);
 });
 it('owner registers normalized DNS challenge and creates immutable event',async()=>{
  const {service,tx}=harness();
  const value=await service.request(actor,partner,{hostname:'CUSTOM.PARTNER.IN',idempotencyKey:key});
  expect(value.hostname).toBe('custom.partner.in');
  expect(value.challenge?.value).toMatch(/^aaraagate-domain-verification=/);
  expect(tx.partnerDomainRegistration.create).toHaveBeenCalledWith({data:expect.objectContaining({
   partnerId:partner,requestedById:actor,hostname:'custom.partner.in',
   challengeHash:expect.stringMatching(/^[a-f0-9]{64}$/),
  }),select:{id:true,status:true}});
  expect(tx.partnerDomainEvent.create).toHaveBeenCalledWith({data:expect.objectContaining({action:PartnerDomainAction.CHALLENGE_CREATED,revision:1}) ,select:{id:true}});
 });
 it('denies partner access before even discovering domain rows',async()=>{
  const {service,tx}=harness();tx.partnerMembership.findFirst.mockResolvedValue(null);
  await expect(service.request(actor,partner,{hostname:'team.partner.in',idempotencyKey:key})).rejects.toBeInstanceOf(NotFoundException);
  expect(tx.partnerDomainRegistration.create).not.toHaveBeenCalled();
 });
 it('refuses reserved or malformed hostnames and denies new registrations in production',async()=>{
  const {service}=harness();
  await expect(service.request(actor,partner,{hostname:'foo.portal.aaraagate.in',idempotencyKey:key})).rejects.toBeInstanceOf(BadRequestException);
  await expect(service.request(actor,partner,{hostname:'bad.test',idempotencyKey:key})).rejects.toBeInstanceOf(BadRequestException);
  process.env.NODE_ENV='production';
  await expect(service.request(actor,partner,{hostname:'team.partner.in',idempotencyKey:key})).rejects.toBeInstanceOf(NotFoundException);
 });
 it('never exposes a prior one-time DNS challenge on replay',async()=>{
  const {service,tx}=harness();
  tx.partnerDomainRegistration.findUnique.mockResolvedValue({id:domainId,hostname:'team.partner.in',status:PartnerDomainStatus.PENDING,requestedById:actor});
  const result=await service.request(actor,partner,{hostname:'TEAM.PARTNER.IN',idempotencyKey:key});
  expect(result.challenge).toBeNull();expect(result.existing).toBe(true);
  expect(tx.partnerDomainRegistration.create).not.toHaveBeenCalled();
 });
 it('rejects changed payload or reallocated hostname',async()=>{
  const {service,tx}=harness();
  tx.partnerDomainRegistration.findUnique.mockResolvedValueOnce({id:domainId,hostname:'other.partner.in',requestedById:actor,status:'PENDING'});
  await expect(service.request(actor,partner,{hostname:'team.partner.in',idempotencyKey:key})).rejects.toBeInstanceOf(ConflictException);
  tx.partnerDomainRegistration.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({id:domainId});
  await expect(service.request(actor,partner,{hostname:'team.partner.in',idempotencyKey:key})).rejects.toBeInstanceOf(ConflictException);
 });
 it('does not permit client-submitted TXT evidence, and refuses missing DNS proof',async()=>{
  const {service,tx}=harness();
  tx.partnerDomainRegistration.findFirst.mockResolvedValue({id:domainId,hostname:'team.partner.in',status:PartnerDomainStatus.PENDING,
   challengeHash:'a'.repeat(64),challengeExpiresAt:new Date(Date.now()+86400000),revision:1});
  vi.spyOn(service,'lookupTxt').mockResolvedValue([['aaraagate-domain-verification=incorrect-token']]);
  await expect(service.verify(actor,partner,domainId)).rejects.toBeInstanceOf(ConflictException);
  expect(tx.partnerDomainRegistration.update).not.toHaveBeenCalled();
 });
 it('revocation cannot make a verified domain routable and is auditable',async()=>{
  const {service,tx}=harness();
  tx.partnerDomainRegistration.findFirst.mockResolvedValue({id:domainId,status:PartnerDomainStatus.VERIFIED,revision:2});
  tx.partnerDomainRegistration.update.mockResolvedValue({id:domainId,status:PartnerDomainStatus.REVOKED,revision:3});
  await expect(service.revoke(actor,partner,domainId)).resolves.toEqual({id:domainId,status:PartnerDomainStatus.REVOKED,activated:false});
  expect(tx.partnerDomainEvent.create).toHaveBeenCalledWith({data:expect.objectContaining({action:PartnerDomainAction.REVOKED,revision:3}),select:{id:true}});
 });
});
