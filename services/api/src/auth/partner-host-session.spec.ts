import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { verifiedHostSessionBinding, HostSessionRequest } from './partner-host-session';
import { SessionService } from './session.service';
import { PartnerBearerGuard } from './partner-bearer.guard';

const partnerId='11111111-1111-4111-8111-111111111111',claimId='22222222-2222-4222-8222-222222222222';
const host='portal.partner.in';
const binding={hostClaimId:claimId,hostClaimVersion:2,originHost:host};
function request(headers:Record<string,string|undefined>={},method='POST'):HostSessionRequest {
 return {method,header:name=>({host,origin:`https://${host}`,...headers})[name]};
}
function fixture(){
 const prisma={
  partnerDomainClaim:{findFirst:vi.fn().mockResolvedValue({id:claimId,version:2,partnerId}),count:vi.fn().mockResolvedValue(1)},
  partnerMembership:{findFirst:vi.fn().mockResolvedValue({id:'member'})},
  partnerInvitation:{findFirst:vi.fn().mockResolvedValue(null)},
  partnerLicenseGrant:{findMany:vi.fn().mockResolvedValue([{version:1,approval:{grantVersion:1},planRevision:{maximumDomains:1}}])},
  session:{create:vi.fn(),findUnique:vi.fn().mockResolvedValue({id:claimId,userId:partnerId,
   societyId:null,audience:'PARTNER',...binding,user:{status:'ACTIVE'},revokedAt:null,
   expiresAt:new Date(Date.now()+60000),refreshExpiresAt:new Date(Date.now()+60000) }),updateMany:vi.fn()},
 };
 const state={getJson:vi.fn().mockResolvedValue(null),setIfAbsentJson:vi.fn().mockResolvedValue(true)};
 const sessions=new SessionService(prisma as never,state as never,{resolve:vi.fn()} as never);
 return {prisma,state,sessions};
}
beforeEach(()=>{
 vi.stubEnv('NODE_ENV','test');vi.stubEnv('AARAGATE_ENABLE_TEST_HOST_SESSIONS','true');
 vi.stubEnv('AARAGATE_PLATFORM_HOSTNAMES','["admin.aaraagate.in"]');
});
afterEach(()=>vi.unstubAllEnvs());
describe('V5.4.17 persisted direct-host session boundary',()=>{
 it('persists only server-derived immutable binding and retains society-less PARTNER audience',async()=>{
  const {prisma,sessions}=fixture();
  await sessions.create(partnerId,undefined,[],{audience:'PARTNER',hostRequest:request()});
  expect(prisma.session.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({...binding,audience:'PARTNER',societyId:null})}));
  expect(prisma.partnerMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({partnerId,userId:partnerId,active:true})}));
 });
 it('rechecks exact claim/version and exposes only derived partner scope',async()=>{
  const {prisma,sessions}=fixture();
  await expect(sessions.getPrincipal('token',request({},'GET'))).resolves.toMatchObject({audience:'PARTNER',hostPartnerId:partnerId,roles:[]});
  expect(prisma.partnerDomainClaim.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:claimId,version:2,hostname:host,status:'VERIFIED',verifiedUntil:{gt:expect.any(Date)}})}));
 });
 it('rejects host mismatch, proxy claims, mutation without exact origin and cross-site reads before DB access',async()=>{
  for(const [headers,method] of [
   [{host:'other.partner.in'},'GET'],[{host:host+':443'},'GET'],
   [{'x-forwarded-host':host},'POST'],[{forwarded:'host='+host},'POST'],
   [{origin:undefined},'POST'],[{origin:'https://other.partner.in'},'GET'],
   [{'sec-fetch-site':'cross-site'},'GET'],[{origin:'http://'+host},'POST'],
  ] as Array<[Record<string,string|undefined>,string]>){
   const {prisma}=fixture();
   await expect(verifiedHostSessionBinding(prisma as never,partnerId,request(headers,method),binding)).rejects.toBeInstanceOf(UnauthorizedException);
   expect(prisma.partnerDomainClaim.findFirst).not.toHaveBeenCalled();
  }
 });
 it('allows same-host navigation without Origin but requires request context for bound bearer',async()=>{
  const {prisma,sessions}=fixture();
  await expect(verifiedHostSessionBinding(prisma as never,partnerId,request({origin:undefined},'GET'),binding)).resolves.toMatchObject({partnerId});
  await expect(sessions.getPrincipal('token')).rejects.toBeInstanceOf(UnauthorizedException);
 });
 it('denies disabled, production, malformed reservation config and reserved platform hosts',async()=>{
  for(const [key,value,headers] of [
   ['NODE_ENV','production',{}],['AARAGATE_ENABLE_TEST_HOST_SESSIONS','false',{}],
   ['AARAGATE_PLATFORM_HOSTNAMES','bad',{}],['AARAGATE_PLATFORM_HOSTNAMES','[]',{}],
   ['AARAGATE_PLATFORM_HOSTNAMES','["portal.partner.in"]',{}],
  ] as Array<[string,string,Record<string,string>]>){
   vi.stubEnv(key,value);const {prisma}=fixture();
   await expect(verifiedHostSessionBinding(prisma as never,partnerId,request(headers))).rejects.toBeInstanceOf(UnauthorizedException);
   vi.stubEnv('NODE_ENV','test');vi.stubEnv('AARAGATE_ENABLE_TEST_HOST_SESSIONS','true');vi.stubEnv('AARAGATE_PLATFORM_HOSTNAMES','["admin.aaraagate.in"]');
  }
 });
 it('denies revoked/reissued/expired claims and current membership revocation',async()=>{
  const {prisma,sessions}=fixture();prisma.partnerDomainClaim.findFirst.mockResolvedValue(null);
  await expect(sessions.getPrincipal('token',request())).rejects.toBeInstanceOf(UnauthorizedException);
  prisma.partnerDomainClaim.findFirst.mockResolvedValue({id:claimId,version:2,partnerId});
  prisma.partnerMembership.findFirst.mockResolvedValue(null);
  await expect(sessions.getPrincipal('token',request())).rejects.toBeInstanceOf(UnauthorizedException);
 });
 it('denies missing/ambiguous/revoked license, changed approval and exceeded capacity',async()=>{
  const {prisma}=fixture();
  for(const grants of [[],[{version:2,approval:{grantVersion:1},planRevision:{maximumDomains:1}}],
   [{version:1,approval:null,planRevision:{maximumDomains:1}}],
   [{version:1,approval:{grantVersion:1},planRevision:{maximumDomains:0}}],
   Array(2).fill({version:1,approval:{grantVersion:1},planRevision:{maximumDomains:1}})]){
   prisma.partnerLicenseGrant.findMany.mockResolvedValue(grants as never);
   await expect(verifiedHostSessionBinding(prisma as never,partnerId,request(),binding)).rejects.toBeInstanceOf(UnauthorizedException);
  }
  prisma.partnerLicenseGrant.findMany.mockResolvedValue([{version:1,approval:{grantVersion:1},planRevision:{maximumDomains:1}}]);
  prisma.partnerDomainClaim.count.mockResolvedValue(2);
  await expect(verifiedHostSessionBinding(prisma as never,partnerId,request(),binding)).rejects.toBeInstanceOf(UnauthorizedException);
 });
 it('denies partial or non-partner binding',async()=>{
  const {prisma,sessions}=fixture();
  const row=await prisma.session.findUnique();
  for(const patch of [{hostClaimId:null},{originHost:null},{hostClaimVersion:0},{audience:'STANDARD'}]){
   prisma.session.findUnique.mockResolvedValue({...row,...patch} as never);
   await expect(sessions.getPrincipal('token',request())).rejects.toBeInstanceOf(UnauthorizedException);
  }
 });
 it('allows only exact partner resource routes and assigns no auth on mismatch',async()=>{
  const {sessions}=fixture();const guard=new PartnerBearerGuard(sessions);
  for(const params of [{partnerId:'other'},{}]){
   const req={...request({authorization:'Bearer token'},'GET'),params,auth:undefined};
   await expect(guard.canActivate({switchToHttp:()=>({getRequest:()=>req})} as never)).rejects.toBeInstanceOf(UnauthorizedException);
   expect(req.auth).toBeUndefined();
  }
  const req={...request({authorization:'Bearer token'},'GET'),params:{partnerId},auth:undefined};
  await expect(guard.canActivate({switchToHttp:()=>({getRequest:()=>req})} as never)).resolves.toBe(true);
 });
 it('refresh rotation remains bound and rejects missing/wrong host before claiming replay state',async()=>{
  const {prisma,state,sessions}=fixture(),token='refresh-token';
  const row=await prisma.session.findUnique();
  prisma.session.findUnique.mockResolvedValue({...row,refreshTokenHash:createHash('sha256').update(token).digest('hex')} as never);
  prisma.session.updateMany.mockResolvedValue({count:1});
  await expect(sessions.refresh(claimId,token)).rejects.toBeInstanceOf(UnauthorizedException);
  await expect(sessions.refresh(claimId,token,request({host:'other.partner.in'}))).rejects.toBeInstanceOf(UnauthorizedException);
  expect(state.setIfAbsentJson).not.toHaveBeenCalled();
  await expect(sessions.refresh(claimId,token,request())).resolves.toHaveProperty('accessToken');
  expect(prisma.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:expect.not.objectContaining({originHost:expect.anything()})}));
  prisma.partnerDomainClaim.findFirst.mockResolvedValue(null);
  state.setIfAbsentJson.mockClear();
  await expect(sessions.refresh(claimId,token,request())).rejects.toBeInstanceOf(UnauthorizedException);
  expect(state.setIfAbsentJson).not.toHaveBeenCalled();
 });
 it('rejects cross-host refresh replay without revoking the bound session',async()=>{
  const {prisma,state,sessions}=fixture();
  state.getJson.mockResolvedValue({sessionId:claimId});
  await expect(sessions.refresh(claimId,'used-token',request({host:'other.partner.in'}))).rejects.toBeInstanceOf(UnauthorizedException);
  expect(prisma.session.updateMany).not.toHaveBeenCalled();
  await expect(sessions.refresh(claimId,'used-token',request())).rejects.toBeInstanceOf(UnauthorizedException);
  expect(prisma.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({revocationReason:'REFRESH_REPLAY'})}));
 });
});
