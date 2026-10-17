import assert from 'node:assert/strict'
import { partnerSessionFrom, partnerSessionKey, partnerStorageKey, readPartnerSession } from '../lib/admin-partner.ts'
const id='11111111-1111-4111-8111-111111111111',society='22222222-2222-4222-8222-222222222222'
const payload={verified:true,contextType:'PARTNER',session:{sessionId:id,accessToken:'a'.repeat(64),refreshToken:'b'.repeat(96)}}
const dedicated=partnerSessionFrom(payload)
assert.equal(dedicated.societyId,'');assert.equal(dedicated.role,'PARTNER');assert.equal(dedicated.audience,'PARTNER')
assert.equal(partnerStorageKey,'aaraagate.partner.session')
for(const changes of [p=>p.contextType='SOCIETY',p=>p.session.accessToken='bad',p=>p.session.refreshToken='bad',p=>p.session.sessionId='not-uuid',p=>p.verified=false]){
 const value=structuredClone(payload);changes(value);assert.throws(()=>partnerSessionFrom(value))
}
const store=new Map()
globalThis.sessionStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)}
store.set('aaraagate.admin.session',JSON.stringify({...dedicated,societyId:society,role:'SOCIETY_ADMIN',audience:undefined}))
assert.equal(readPartnerSession()?.societyId,society)
store.set(partnerStorageKey,JSON.stringify(dedicated))
assert.equal(readPartnerSession()?.audience,'PARTNER')
assert.notEqual(partnerSessionKey(readPartnerSession()),partnerSessionKey({...dedicated,societyId:society,role:'SOCIETY_ADMIN'}))
store.set(partnerStorageKey,JSON.stringify({...dedicated,societyId:society}))
assert.equal(readPartnerSession(),null)
store.delete(partnerStorageKey)
assert.equal(readPartnerSession()?.role,'SOCIETY_ADMIN')
console.log('V5.4.14 partner-only OTP session parser, audience and storage isolation: PASS')
