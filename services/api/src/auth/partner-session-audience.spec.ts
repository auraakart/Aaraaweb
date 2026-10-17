import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { SessionService } from './session.service';
import { BearerGuard } from './bearer.guard';
import { PartnerBearerGuard } from './partner-bearer.guard';

const userId='11111111-1111-4111-8111-111111111111';
function setup() {
 const prisma={
  session:{create:vi.fn(),findUnique:vi.fn().mockResolvedValue({
   id:'22222222-2222-4222-8222-222222222222',userId,societyId:null,audience:'PARTNER',
   revokedAt:null,expiresAt:new Date(Date.now()+120000),user:{status:'ACTIVE'},society:null,
  }),updateMany:vi.fn()},
  partnerMembership:{findFirst:vi.fn().mockResolvedValue({id:'33333333-3333-4333-8333-333333333333'})},
  partnerInvitation:{findFirst:vi.fn().mockResolvedValue(null)},
 };
 const sessions=new SessionService(prisma as never,{getJson:vi.fn().mockResolvedValue(null),setIfAbsentJson:vi.fn().mockResolvedValue(true)} as never,{resolve:vi.fn()} as never);
 const request:{auth?:unknown;header:(name:string)=>string|undefined}={header:name=>name==='authorization'?'Bearer token':undefined};
 const context={switchToHttp:()=>({getRequest:()=>request})} as never;
 return {prisma,sessions,request,context};
}
describe('V5.4.16 persisted partner session isolation',()=>{
 it('persists PARTNER server-side and refuses any operational society binding',async()=>{
  const {prisma,sessions}=setup();
  await sessions.create(userId,undefined,[],{audience:'PARTNER'});
  expect(prisma.session.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({audience:'PARTNER',societyId:null})}));
  await expect(sessions.create(userId,userId,[],{audience:'PARTNER'})).rejects.toBeInstanceOf(UnauthorizedException);
 });
 it('rejects partner bearer on normal API, permits partner API only',async()=>{
  const {sessions,request,context}=setup();
  await expect(sessions.getPrincipal('token')).resolves.toEqual({userId,societyId:undefined,roles:[],audience:'PARTNER'});
  await expect(new BearerGuard(sessions).canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  expect(request.auth).toBeUndefined();
  await expect(new PartnerBearerGuard(sessions).canActivate(context)).resolves.toBe(true);
  expect(request.auth).toMatchObject({audience:'PARTNER',roles:[]});
 });
 it('denies revoked/suspended commercial access before partner API',async()=>{
  const {prisma,sessions,context}=setup();
  prisma.partnerMembership.findFirst.mockResolvedValue(null);
  await expect(new PartnerBearerGuard(sessions).canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
 });
 it('allows an unexpired pending partner invitation without society authority',async()=>{
  const {prisma,sessions,context}=setup();
  prisma.partnerMembership.findFirst.mockResolvedValue(null);
  prisma.partnerInvitation.findFirst.mockResolvedValue({id:'invite'});
  await expect(new PartnerBearerGuard(sessions).canActivate(context)).resolves.toBe(true);
  await expect(new BearerGuard(sessions).canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
 });
 it('denies partner session with a forged society ID',async()=>{
  const {prisma,sessions}=setup();
  prisma.session.findUnique.mockResolvedValue({id:userId,userId,societyId:userId,audience:'PARTNER',revokedAt:null,expiresAt:new Date(Date.now()+120000),user:{status:'ACTIVE'},society:{status:'ACTIVE'}});
  await expect(sessions.getPrincipal('token')).rejects.toBeInstanceOf(UnauthorizedException);
 });
 it('denies invalid audience even if user active',async()=>{
  const {prisma,sessions}=setup();
  prisma.session.findUnique.mockResolvedValue({id:userId,userId,societyId:null,audience:'INVALID',revokedAt:null,expiresAt:new Date(Date.now()+120000),user:{status:'ACTIVE'},society:null});
  await expect(sessions.getPrincipal('token')).rejects.toBeInstanceOf(UnauthorizedException);
 });
 it('keeps ordinary independently created sessions STANDARD without commercial flags',async()=>{
  const {prisma,sessions}=setup();
  await sessions.create(userId,undefined,[]);
  expect(prisma.session.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({audience:'STANDARD',societyId:null})}));
 });
 it('rejects partner audience when caller supplies only a society role',async()=>{
  const {sessions}=setup();
  await expect(sessions.create(userId,undefined,['SOCIETY_ADMIN' as never],{audience:'PARTNER'})).rejects.toBeInstanceOf(UnauthorizedException);
 });
 it('rotates dedicated PARTNER refresh only while commercial authority remains active',async()=>{
  const {prisma,sessions}=setup(),old='partner-refresh';
  prisma.session.findUnique.mockResolvedValue({
   id:userId,userId,societyId:null,audience:'PARTNER',revokedAt:null,
   refreshTokenHash:createHash('sha256').update(old).digest('hex'),
   refreshExpiresAt:new Date(Date.now()+120000),user:{status:'ACTIVE'},society:null,
  });
  prisma.session.updateMany.mockResolvedValue({count:1});
  await expect(sessions.refresh(userId,old)).resolves.toHaveProperty('accessToken');
  expect(prisma.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:userId,revokedAt:null})}));
 });
 it('allows pending invitee to refresh but denies a revoked invite and membership',async()=>{
  const {prisma,sessions}=setup(),old='invited-refresh';
  prisma.session.findUnique.mockResolvedValue({
   id:userId,userId,societyId:null,audience:'PARTNER',revokedAt:null,
   refreshTokenHash:createHash('sha256').update(old).digest('hex'),
   refreshExpiresAt:new Date(Date.now()+120000),user:{status:'ACTIVE'},society:null,
  });
  prisma.partnerMembership.findFirst.mockResolvedValue(null);
  prisma.partnerInvitation.findFirst.mockResolvedValue({id:'invite'});
  prisma.session.updateMany.mockResolvedValue({count:1});
  await expect(sessions.refresh(userId,old)).resolves.toHaveProperty('accessToken');
  prisma.partnerInvitation.findFirst.mockResolvedValue(null);
  await expect(sessions.refresh(userId,old)).rejects.toBeInstanceOf(UnauthorizedException);
 });
 it('refuses partner refresh after membership revocation before consuming rotation',async()=>{
  const {prisma,sessions}=setup(),old='revoked-refresh';
  prisma.session.findUnique.mockResolvedValue({
   id:userId,userId,societyId:null,audience:'PARTNER',revokedAt:null,
   refreshTokenHash:createHash('sha256').update(old).digest('hex'),
   refreshExpiresAt:new Date(Date.now()+120000),user:{status:'ACTIVE'},society:null,
  });
  prisma.partnerMembership.findFirst.mockResolvedValue(null);
  await expect(sessions.refresh(userId,old)).rejects.toBeInstanceOf(UnauthorizedException);
  expect(prisma.session.updateMany).not.toHaveBeenCalled();
 });
 it('denies bad audience and cross-society partner refresh',async()=>{
  const {prisma,sessions}=setup(),old='invalid-refresh',base={
   id:userId,userId,revokedAt:null,
   refreshTokenHash:createHash('sha256').update(old).digest('hex'),
   refreshExpiresAt:new Date(Date.now()+120000),user:{status:'ACTIVE'},society:null,
  };
  prisma.session.findUnique.mockResolvedValue({...base,societyId:null,audience:'UNKNOWN'});
  await expect(sessions.refresh(userId,old)).rejects.toBeInstanceOf(UnauthorizedException);
  prisma.session.findUnique.mockResolvedValue({...base,societyId:userId,audience:'PARTNER',society:{status:'ACTIVE'}});
  await expect(sessions.refresh(userId,old)).rejects.toBeInstanceOf(UnauthorizedException);
  expect(prisma.session.updateMany).not.toHaveBeenCalled();
 });
});
