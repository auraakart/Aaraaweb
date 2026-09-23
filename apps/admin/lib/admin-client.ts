export type Session={
  sessionId:string;
  accessToken:string;
  refreshToken:string;
  societyId:string;
  role:string;
  societyName:string;
};
export type Membership={societyId:string;role:string;society?:{name?:string;code?:string};};

const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'');
const storageKey='aaraagate.admin.session';
const refreshes=new Map<string,Promise<Session>>();
function contextKey(session:Session){return `${session.societyId}:${session.role}`}
function storedFor(session:Session):Session{
  if(typeof sessionStorage==='undefined')return session;
  try{const raw=sessionStorage.getItem(storageKey);if(!raw)return session;const stored=JSON.parse(raw) as Session;return stored.societyId===session.societyId&&stored.role===session.role&&stored.accessToken&&stored.refreshToken?stored:session}catch{return session}
}
function save(session:Session){if(typeof sessionStorage!=='undefined')sessionStorage.setItem(storageKey,JSON.stringify(session))}
function clearIfCurrent(session:Session){
  if(typeof sessionStorage==='undefined')return;
  try{const raw=sessionStorage.getItem(storageKey);if(!raw)return;const stored=JSON.parse(raw) as Session;if(stored.societyId===session.societyId&&stored.role===session.role&&stored.sessionId===session.sessionId)sessionStorage.removeItem(storageKey)}catch{/* best-effort */}
}
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
  if(!next?.sessionId||!next.accessToken||!next.refreshToken)throw new Error('Session refresh returned incomplete credentials');
  const fresh={...current,sessionId:String(next.sessionId),accessToken:String(next.accessToken),refreshToken:String(next.refreshToken)};save(fresh);return fresh;
}
export function refreshAdminSession(current:Session):Promise<Session>{
  const latest=storedFor(current),key=contextKey(latest),existing=refreshes.get(key);if(existing)return existing;
  const active=performRefresh(latest).catch(error=>{clearIfCurrent(latest);throw error}).finally(()=>refreshes.delete(key));refreshes.set(key,active);return active;
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
  if(result.response.status===401&&active&&path!='/auth/refresh'){
    const latest=storedFor(active);
    active=latest.sessionId!==active.sessionId||latest.accessToken!==active.accessToken?latest:await refreshAdminSession(active);
    result=await request(path,init,active);
  }
  if(!result.response.ok)throw new Error(message(result.body,result.response.status));return result.body as T;
}
export function sessionFrom(value:Record<string,unknown>,membership:Membership):Session{
  const session=value.session as Record<string,unknown>|undefined;
  if(!session?.sessionId||!session.accessToken||!session.refreshToken)throw new Error('Authentication returned an incomplete session');
  return {sessionId:String(session.sessionId),accessToken:String(session.accessToken),refreshToken:String(session.refreshToken),societyId:membership.societyId,role:membership.role,societyName:membership.society?.name??membership.society?.code??'Society'};
}
