import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PartnerInvitationStatus, PartnerMemberAction, PartnerRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PartnerBearerGuard } from '../auth/partner-bearer.guard';
import { PartnerMemberLifecycleController } from './partner-member-lifecycle.controller';
import { PartnerMemberLifecycleService } from './partner-member-lifecycle.service';
const actor='11111111-1111-4111-8111-111111111111', partner='22222222-2222-4222-8222-222222222222';
const target='33333333-3333-4333-8333-333333333333', key='44444444-4444-4444-8444-444444444444', invitationId='55555555-5555-4555-8555-555555555555';
function harness(){
 const tx={
  $queryRaw:vi.fn().mockResolvedValue([{id:partner,status:'ACTIVE'}]),
  user:{findFirst:vi.fn().mockResolvedValue({id:target})},
  partnerMembership:{
   findFirst:vi.fn().mockResolvedValue({id:'owner'}),
   findMany:vi.fn().mockResolvedValue([]),
   count:vi.fn().mockResolvedValue(1),
   upsert:vi.fn().mockResolvedValue({id:'new-member',role:PartnerRole.COMMERCIAL_ADMIN}),
   update:vi.fn().mockResolvedValue({}),
  },
  partnerInvitation:{
   findUnique:vi.fn().mockResolvedValue(null),
   findFirst:vi.fn().mockResolvedValue(null),
   findMany:vi.fn().mockResolvedValue([]),
   create:vi.fn().mockResolvedValue({id:invitationId,status:PartnerInvitationStatus.PENDING}),
   update:vi.fn().mockResolvedValue({}),
  },
  partnerMembershipEvent:{create:vi.fn().mockResolvedValue({id:'event'})},
 };
 const db={$transaction:vi.fn(async (f:(transaction:typeof tx)=>Promise<unknown>)=>f(tx)),partnerInvitation:tx.partnerInvitation};
 return {tx,db,service:new PartnerMemberLifecycleService(db as never)};
}
describe('V5.4.9 commercial member isolation, replay and audit',()=>{
 it('requires bearer session and no society AppRole elevation',()=>{
  expect(Reflect.getMetadata(GUARDS_METADATA,PartnerMemberLifecycleController)).toContain(PartnerBearerGuard);
 });
 it('creates owner-issued invite only for existing active user with immutable event',async()=>{
  const {tx,service}=harness();
  await expect(service.invite(actor,partner,{userId:target,role:PartnerRole.BRAND_MANAGER,idempotencyKey:key})).resolves.toEqual({id:invitationId,status:'PENDING'});
  expect(tx.partnerMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({role:PartnerRole.OWNER,active:true,userId:actor,partnerId:partner})}));
  expect(tx.partnerInvitation.create).toHaveBeenCalledTimes(1);
  expect(tx.partnerMembershipEvent.create).toHaveBeenCalledWith({data:expect.objectContaining({action:PartnerMemberAction.INVITED,subjectUserId:target,actorId:actor})});
 });
 it('rejects foreign/non-owner before lookup and any write',async()=>{
  const {tx,service}=harness();tx.partnerMembership.findFirst.mockResolvedValue(null);
  await expect(service.invite(actor,partner,{userId:target,role:PartnerRole.SUPPORT,idempotencyKey:key})).rejects.toBeInstanceOf(NotFoundException);
  expect(tx.partnerInvitation.create).not.toHaveBeenCalled();
  expect(tx.partnerMembershipEvent.create).not.toHaveBeenCalled();
 });
 it('reuses identical idempotency key but refuses changed recipient or role',async()=>{
  const {tx,service}=harness();
  tx.partnerInvitation.findUnique.mockResolvedValue({id:invitationId,userId:target,invitedById:actor,role:PartnerRole.SUPPORT,status:'PENDING'});
  await expect(service.invite(actor,partner,{userId:target,role:PartnerRole.SUPPORT,idempotencyKey:key})).resolves.toEqual({id:invitationId,status:'PENDING'});
  await expect(service.invite(actor,partner,{userId:target,role:PartnerRole.OWNER,idempotencyKey:key})).rejects.toBeInstanceOf(ConflictException);
  expect(tx.partnerMembershipEvent.create).not.toHaveBeenCalled();
 });
 it('accepts only invitee on live invitation and writes partner role',async()=>{
  const {tx,service}=harness();
  tx.partnerInvitation.findFirst.mockResolvedValue({id:invitationId,partnerId:partner,userId:target,invitedById:actor,role:PartnerRole.SUPPORT,status:'PENDING',expiresAt:new Date(Date.now()+60000)});
  await expect(service.respond(target,partner,invitationId,true)).resolves.toEqual({id:invitationId,status:'ACCEPTED'});
  expect(tx.partnerMembership.upsert).toHaveBeenCalledWith(expect.objectContaining({where:{partnerId_userId_role:{partnerId:partner,userId:target,role:PartnerRole.SUPPORT}}}));
  expect(tx.partnerMembershipEvent.create).toHaveBeenCalledWith({data:expect.objectContaining({action:PartnerMemberAction.ACCEPTED,actorId:target})});
 });
 it('prevents acceptance of expired invitation and false recipient',async()=>{
  const {tx,service}=harness();
  tx.partnerInvitation.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({id:invitationId,userId:target,partnerId:partner,invitedById:actor,role:PartnerRole.SUPPORT,status:'PENDING',expiresAt:new Date(Date.now()-60000)});
  await expect(service.respond(target,partner,invitationId,true)).rejects.toBeInstanceOf(NotFoundException);
  await expect(service.respond(target,partner,invitationId,true)).rejects.toBeInstanceOf(ConflictException);
  expect(tx.partnerMembership.upsert).not.toHaveBeenCalled();
 });
 it('prevents last owner revocation even by current owner',async()=>{
  const {tx,service}=harness();
  tx.partnerMembership.findFirst.mockResolvedValueOnce({id:'own'}).mockResolvedValueOnce({id:'own',userId:actor,role:PartnerRole.OWNER});
  await expect(service.revoke(actor,partner,'own')).rejects.toBeInstanceOf(ConflictException);
  expect(tx.partnerMembership.update).not.toHaveBeenCalled();
 });
 it('prohibits role alteration without owner authority',async()=>{
  const {tx,service}=harness();tx.partnerMembership.findFirst.mockResolvedValue(null);
  await expect(service.changeRole(actor,partner,'m1',PartnerRole.OWNER)).rejects.toBeInstanceOf(NotFoundException);
  expect(tx.partnerMembership.upsert).not.toHaveBeenCalled();
 });
 it('inbox selects only requester pending roles and no personal contacts',async()=>{
  const {tx,service}=harness();await service.inbox(target);
  expect(tx.partnerInvitation.findMany).toHaveBeenCalledWith(expect.objectContaining({
   where:expect.objectContaining({userId:target,status:PartnerInvitationStatus.PENDING}),
   select:{id:true,partnerId:true,role:true,expiresAt:true,partner:{select:{displayName:true}}},
  }));
 });
});
