export type Session={
  sessionId:string;
  accessToken:string;
  refreshToken:string;
  societyId:string;
  role:string;
  societyName:string;
  audience?:'PARTNER';
};
export type Membership={societyId:string;role:string;society?:{name?:string;code?:string};};

const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'');
const storageKey='aaraagate.admin.session';
const partnerStorageKey='aaraagate.partner.session';
const keyFor=(session:Session)=>session.audience==='PARTNER'?partnerStorageKey:storageKey;
const refreshes=new Map<string,Promise<Session>>();
// Remember only rotations performed by this client, never an unrelated login.
const rotations=new Map<string,{currentId:string;ids:Set<string>}>();
function contextKey(session:Session){return `${session.audience??'SOCIETY'}:${session.societyId}:${session.role}:${session.sessionId}`}
const sameScope=(a:Session,b:Session)=>a.audience===b.audience&&a.societyId===b.societyId&&a.role===b.role;
function storedFor(session:Session):Session{
  if(typeof sessionStorage==='undefined')return session;
  const key=keyFor(session);
  let stored:Session|null=null;
  try{stored=JSON.parse(sessionStorage.getItem(key)??'null') as Session|null}catch{/* Invalid storage is not an authenticated context. */}
  const family=rotations.get(key);
  if(family&&family.currentId!==stored?.sessionId)rotations.delete(key);
  if(stored&&sameScope(stored,session)&&stored.accessToken&&stored.refreshToken&&stored.sessionId&&
      (stored.sessionId===session.sessionId||rotations.get(key)?.ids.has(session.sessionId)))return stored;
  throw new Error('Sign-in or society changed. Reopen this workspace before continuing.');
}
function save(session:Session){if(typeof sessionStorage!=='undefined')sessionStorage.setItem(keyFor(session),JSON.stringify(session))}
function clearIfCurrent(session:Session){
  if(typeof sessionStorage==='undefined')return false;
  try{const key=keyFor(session),raw=sessionStorage.getItem(key);if(!raw)return false;const stored=JSON.parse(raw) as Session;if(sameScope(stored,session)&&stored.sessionId===session.sessionId&&stored.refreshToken===session.refreshToken){sessionStorage.removeItem(key);rotations.delete(key);return true}}catch{/* best-effort */}
  return false;
}
export function isAdminSessionCurrent(session:Session){try{storedFor(session);return true}catch{return false}}
export function clearAdminSessionIfCurrent(session:Session){try{return clearIfCurrent(storedFor(session))}catch{return false}}
function message(body:unknown,status:number){
  if(body&&typeof body==='object'&&'message' in body){const value=(body as {message:unknown}).message;return Array.isArray(value)?value.map(String).join(', '):String(value)}
  return `Request failed (${status})`;
}
async function readResponse(response:Response){const text=await response.text();if(!text)return null;try{return JSON.parse(text) as unknown}catch{return text}}
async function request(path:string,init:RequestInit,session?:Session){
  const response=await fetch(`${base}/api/v1${path}`,{...init,headers:{Accept:'application/json','Content-Type':'application/json',...(session?{Authorization:`Bearer ${session.accessToken}`}:{}),...init.headers}});
  return {response,body:await readResponse(response)};
}
async function performRefresh(current:Session):Promise<Session>{
  const {response,body}=await request('/auth/refresh',{method:'POST',body:JSON.stringify({sessionId:current.sessionId,refreshToken:current.refreshToken})});
  if(!response.ok)throw new Error(message(body,response.status));
  const next=body as Record<string,unknown>|null;
  if(!next||['sessionId','accessToken','refreshToken'].some(key=>typeof next[key]!=='string'||!(next[key] as string).trim()))throw new Error('Session refresh returned incomplete credentials');
  // Compare after the await: a late refresh must not restore an old login.
  const latest=storedFor(current);
  if(latest.sessionId!==current.sessionId||latest.refreshToken!==current.refreshToken)return latest;
  const fresh={...current,sessionId:next.sessionId as string,accessToken:next.accessToken as string,refreshToken:next.refreshToken as string};save(fresh);
  if(typeof sessionStorage!=='undefined'){
    const key=keyFor(current),family=rotations.get(key),ids=family?.currentId===current.sessionId?family.ids:new Set([current.sessionId]);
    ids.add(fresh.sessionId);rotations.set(key,{currentId:fresh.sessionId,ids});
  }
  return fresh;
}
export function refreshAdminSession(current:Session):Promise<Session>{
  try{
    const latest=storedFor(current),key=contextKey(latest),existing=refreshes.get(key);if(existing)return existing;
    const active=performRefresh(latest).catch(error=>{clearIfCurrent(latest);throw error}).finally(()=>refreshes.delete(key));refreshes.set(key,active);return active;
  }catch(error){return Promise.reject(error)}
}
export async function logoutAdminSession(current:Session):Promise<void>{
  let active=storedFor(current);
  const pending=refreshes.get(contextKey(active));
  if(pending){try{active=await pending}catch{active=storedFor(active)}}
  active=storedFor(active);
  const {response,body}=await request('/auth/logout',{method:'POST',body:JSON.stringify({sessionId:active.sessionId,refreshToken:active.refreshToken})});
  if(!response.ok)throw new Error(message(body,response.status));
  clearIfCurrent(active);
}
export async function api<T>(path:string,init:RequestInit={},session?:Session):Promise<T>{
  let active=session?storedFor(session):undefined;let result=await request(path,init,active);
  if(active)storedFor(active); // Discard responses from a replaced or signed-out login.
  if(result.response.status===401&&active&&path!='/auth/refresh'){
    const latest=storedFor(active);
    active=latest.sessionId!==active.sessionId||latest.accessToken!==active.accessToken?latest:await refreshAdminSession(active);
    result=await request(path,init,active);
  }
  if(active)storedFor(active);
  if(!result.response.ok)throw new Error(message(result.body,result.response.status));return result.body as T;
}
export function sessionFrom(value:Record<string,unknown>,membership:Membership):Session{
  const session=value.session as Record<string,unknown>|undefined;
  if(!session?.sessionId||!session.accessToken||!session.refreshToken)throw new Error('Authentication returned an incomplete session');
  return {sessionId:String(session.sessionId),accessToken:String(session.accessToken),refreshToken:String(session.refreshToken),societyId:membership.societyId,role:membership.role,societyName:membership.society?.name??membership.society?.code??'Society'};
}
