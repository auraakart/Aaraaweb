import assert from 'node:assert/strict'
import {test,beforeEach,after} from 'node:test'
import {api,refreshAdminSession,logoutAdminSession,isAdminSessionCurrent,clearAdminSessionIfCurrent} from '../lib/admin-client.ts'

const originalFetch=globalThis.fetch,originalStorage=globalThis.sessionStorage
const entries=new Map()
globalThis.sessionStorage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)}
const key='aaraagate.admin.session',partnerKey='aaraagate.partner.session'
let sequence=0
const session=(patch={})=>({sessionId:`session-${++sequence}`,accessToken:`access-${sequence}`,refreshToken:`refresh-${sequence}`,societyId:'society-one',role:'SOCIETY_ADMIN',societyName:'Test society',...patch})
const save=value=>sessionStorage.setItem(value.audience==='PARTNER'?partnerKey:key,JSON.stringify(value))
const stored=()=>JSON.parse(sessionStorage.getItem(key))
const response=(body,status=200)=>new Response(JSON.stringify(body),{status})
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return{promise,resolve}}
const tick=()=>new Promise(resolve=>setImmediate(resolve))
beforeEach(()=>entries.clear())
after(()=>{globalThis.fetch=originalFetch;if(originalStorage===undefined)delete globalThis.sessionStorage;else globalThis.sessionStorage=originalStorage})

for(const patch of [{},{societyId:'society-two'},{role:'AUDITOR'}])test(`stale request cannot adopt replacement credentials ${JSON.stringify(patch)}`,async()=>{
  const old=session(),fresh=session(patch);save(fresh);let calls=0;globalThis.fetch=async()=>{calls++;return response({})}
  await assert.rejects(api('/protected',{method:'POST',body:'{}'},old),/changed/);assert.equal(calls,0);assert.equal(stored().sessionId,fresh.sessionId)
})
test('signed-out callbacks cannot send credentials',async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;return response({})}
  await assert.rejects(api('/protected',{},session()),/changed/);assert.equal(calls,0)
})
test('late successful read is discarded after replacement login',async()=>{
  const old=session(),fresh=session(),gate=deferred();save(old);globalThis.fetch=()=>gate.promise
  const result=api('/protected',{},old);save(fresh);gate.resolve(response({private:'old data'}))
  await assert.rejects(result,/changed/);assert.equal(stored().sessionId,fresh.sessionId)
})
test('old 401 mutation is never replayed as the replacement login',async()=>{
  const old=session(),fresh=session(),gate=deferred();save(old);const calls=[]
  globalThis.fetch=async(url,init)=>{calls.push({url,token:init.headers.Authorization});return gate.promise}
  const result=api('/mutate',{method:'POST',body:'{}'},old);save(fresh);gate.resolve(response({message:'expired'},401))
  await assert.rejects(result,/changed/);assert.equal(calls.length,1);assert.equal(calls[0].token,`Bearer ${old.accessToken}`)
})
for(const status of [200,401])test(`late refresh ${status} cannot overwrite or clear a newer login`,async()=>{
  const old=session(),fresh=session(),rotated=session(),gate=deferred();save(old);globalThis.fetch=()=>gate.promise
  const pending=refreshAdminSession(old);save(fresh);gate.resolve(response(rotated,status))
  await assert.rejects(pending);assert.equal(stored().sessionId,fresh.sessionId)
  assert.equal(clearAdminSessionIfCurrent(old),false);assert.equal(stored().sessionId,fresh.sessionId)
})
test('replacement login gets an independent refresh rather than joining the old flight',async()=>{
  const old=session(),fresh=session(),rotated=session(),gates=[deferred(),deferred()];let calls=0;save(old)
  globalThis.fetch=()=>gates[calls++].promise
  const oldPending=refreshAdminSession(old);save(fresh);const freshPending=refreshAdminSession(fresh)
  assert.equal(calls,2);gates[1].resolve(response(rotated));await freshPending
  gates[0].resolve(response({message:'expired'},401));await assert.rejects(oldPending)
  assert.equal(stored().sessionId,rotated.sessionId)
})
test('concurrent same-login 401s share one refresh and retain exactly one retry',async()=>{
  const old=session(),fresh=session();save(old);let refreshCount=0,requests=0
  globalThis.fetch=async(url,init)=>{
    if(url.endsWith('/auth/refresh')){refreshCount++;await tick();return response(fresh)}
    requests++;return init.headers.Authorization===`Bearer ${fresh.accessToken}`?response({ok:true}):response({message:'expired'},401)
  }
  const values=await Promise.all([api('/one',{},old),api('/two',{},old)])
  assert.deepEqual(values,[{ok:true},{ok:true}]);assert.equal(refreshCount,1);assert.equal(requests,4)
  assert.equal(isAdminSessionCurrent(old),true)
  assert.deepEqual(await api('/from-legacy-component',{},old),{ok:true})
})
test('legacy callers follow two authorized rotations without adopting another login',async()=>{
  const old=session(),first=session(),second=session();save(old);let refreshCount=0
  globalThis.fetch=async url=>url.endsWith('/auth/refresh')?response(++refreshCount===1?first:second):response({ok:true})
  await refreshAdminSession(old);await refreshAdminSession(old)
  assert.equal(stored().sessionId,second.sessionId);assert.deepEqual(await api('/old-component',{},old),{ok:true})
  save(session());await assert.rejects(api('/stale-component',{},old),/changed/)
})
test('logout waits for owned refresh and revokes its rotated credentials',async()=>{
  const old=session(),fresh=session(),gate=deferred();save(old);const logouts=[]
  globalThis.fetch=async(url,init)=>{
    if(url.endsWith('/auth/refresh'))return gate.promise
    logouts.push(JSON.parse(init.body));return response({ok:true})
  }
  const refresh=refreshAdminSession(old),logout=logoutAdminSession(old);gate.resolve(response(fresh))
  await Promise.all([refresh,logout]);assert.deepEqual(logouts,[{sessionId:fresh.sessionId,refreshToken:fresh.refreshToken}]);assert.equal(sessionStorage.getItem(key),null)
})
test('stale logout cannot revoke a replacement login',async()=>{
  const old=session(),fresh=session();save(fresh);let calls=0;globalThis.fetch=async()=>{calls++;return response({})}
  await assert.rejects(logoutAdminSession(old),/changed/);assert.equal(calls,0);assert.equal(stored().sessionId,fresh.sessionId)
})
test('late logout completion preserves a new login',async()=>{
  const old=session(),fresh=session(),gate=deferred();save(old);globalThis.fetch=()=>gate.promise
  const pending=logoutAdminSession(old);save(fresh);gate.resolve(response({ok:true}));await pending
  assert.equal(stored().sessionId,fresh.sessionId);assert.equal(clearAdminSessionIfCurrent(old),false)
})
test('logout waiting on refresh does not switch to a new login',async()=>{
  const old=session(),fresh=session(),gate=deferred();save(old);let logouts=0
  globalThis.fetch=async url=>{if(url.endsWith('/auth/refresh'))return gate.promise;logouts++;return response({})}
  const refresh=refreshAdminSession(old),logout=logoutAdminSession(old);save(fresh);gate.resolve(response(session()))
  await assert.rejects(refresh);await assert.rejects(logout,/changed/);assert.equal(logouts,0);assert.equal(stored().sessionId,fresh.sessionId)
})
test('malformed refresh credentials are not coerced into authentication',async()=>{
  const old=session();save(old);globalThis.fetch=async()=>response({sessionId:123,accessToken:456,refreshToken:true})
  await assert.rejects(refreshAdminSession(old),/incomplete credentials/);assert.equal(sessionStorage.getItem(key),null)
})
test('partner and society storage retain separate authentication lineages',async()=>{
  const admin=session(),partner=session({audience:'PARTNER'}),freshPartner=session({audience:'PARTNER'});save(admin);save(partner)
  globalThis.fetch=async()=>response(freshPartner);await refreshAdminSession(partner)
  assert.equal(stored().sessionId,admin.sessionId);assert.equal(isAdminSessionCurrent(partner),true)
  assert.equal(JSON.parse(sessionStorage.getItem(partnerKey)).sessionId,freshPartner.sessionId)
})
test('server-side callers without browser storage retain the explicit session contract',async()=>{
  const storage=globalThis.sessionStorage;delete globalThis.sessionStorage
  try{globalThis.fetch=async()=>response({ok:true});assert.deepEqual(await api('/server',{},session()),{ok:true})}finally{globalThis.sessionStorage=storage}
})
