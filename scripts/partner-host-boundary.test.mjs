import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveLocalPartnerHostContext,previewSessionHostMatch,testHostResponseHeaders} from '../packages/config/src/partner-host-boundary.mjs';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const host='white.partner.in',now='2026-10-13T18:00:00Z';
const row={hostname:host,partnerId:a,brandId:b,status:'VERIFIED',verifiedAt:'2026-10-13T00:00:00Z',verifiedUntil:'2026-10-20T00:00:00Z'};
const data=(change={})=>({rawHost:host,origin:'https://'+host,platformHostnames:['admin.aaraagate.in'],registry:[row],nowUtc:now,...change});
test('only a single verified matching candidate is inert',()=>{
 const c=resolveLocalPartnerHostContext(data());
 assert.deepEqual(c,{kind:'PARTNER_PREVIEW',hostname:host,partnerId:a,brandId:b,routingActivated:false,sessionBound:false});
 assert.equal(Object.isFrozen(c),true);
 assert.equal(resolveLocalPartnerHostContext(data({rawHost:'ADMIN.AARAAGATE.IN',origin:'https://admin.aaraagate.in'})).kind,'PLATFORM');
});
test('fail closed on spoofed proxy, cross-host Origin, unsafe schemes and URL injection',()=>{
 for(const c of [
  {forwardedHost:'white.partner.in'},{forwardedHost:'other.partner.in'},
  {origin:'http://white.partner.in'},{origin:'https://other.partner.in'},
  {origin:'https://white.partner.in/'},{origin:'https://white.partner.in:443'},
  {rawHost:'white.partner.in:443'},{rawHost:'https://white.partner.in'},
  {rawHost:'white.partner.in,evil.in'},{rawHost:'*.partner.in'},
  {origin:undefined},
 ])assert.equal(resolveLocalPartnerHostContext(data(c)),null,JSON.stringify(c));
});
test('deny revoked, expired, duplicate and unauthorized registry projections',()=>{
 for(const registry of [
  [{...row,status:'PENDING'}],[{...row,status:'REVOKED'}],
  [{...row,verifiedUntil:now}],[row,row],
  [{...row,partnerId:'invalid'}],[{...row,brandId:'invalid'}],
  [{...row,hostname:'other.partner.in'}],
 ])assert.equal(resolveLocalPartnerHostContext(data({registry})),null);
});
test('platform hosts cannot be taken over and invalid allowlists fail closed',()=>{
 const x=resolveLocalPartnerHostContext(data({rawHost:'admin.aaraagate.in',origin:'https://admin.aaraagate.in',registry:[{...row,hostname:'admin.aaraagate.in'}]}));
 assert.equal(x.kind,'PLATFORM');
 for(const platformHostnames of [[],['admin.aaraagate.in','ADMIN.AARAAGATE.IN'],['invalid host'],Array(21).fill('admin.aaraagate.in')])
  assert.equal(resolveLocalPartnerHostContext(data({platformHostnames})),null);
});
test('existing partner tokens do not satisfy future session-host binding',()=>{
 const c=resolveLocalPartnerHostContext(data()),id='33333333-3333-4333-8333-333333333333';
 for(const s of [
  {sessionId:id,audience:'PARTNER',partnerId:a},
  {sessionId:id,audience:'PARTNER_HOST_BOUND',partnerId:a,originHost:'other.partner.in',hostBindingVerified:true},
  {sessionId:id,audience:'PARTNER_HOST_BOUND',partnerId:b,originHost:host,hostBindingVerified:true},
  {sessionId:id,audience:'PARTNER_HOST_BOUND',partnerId:a,originHost:host,hostBindingVerified:false},
 ])assert.equal(previewSessionHostMatch(s,c),false);
 assert.equal(previewSessionHostMatch({sessionId:id,audience:'PARTNER_HOST_BOUND',partnerId:a,originHost:host,hostBindingVerified:true},c),true);
});
test('host-varying preview responses cannot be cached or used as authorization',()=>{
 assert.equal(testHostResponseHeaders['Cache-Control'],'no-store, private');
 assert.match(testHostResponseHeaders.Vary,/Host/);assert.match(testHostResponseHeaders.Vary,/Origin/);
 assert.equal(resolveLocalPartnerHostContext(data({origin:undefined})),null);
});
