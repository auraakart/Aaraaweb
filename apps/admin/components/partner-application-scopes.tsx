'use client'
import {useEffect,useRef,useState} from 'react'
import {api,type Session} from '../lib/admin-client'
import {licensingSessionKey,readLicensingSession,type LicenseView,type LicensingOverview} from '../lib/admin-licensing'
import {operatorConfirm} from '../lib/operator-dialog'
type App={id:string;applicationId:string;appRole:string}
type Scope={id:string;applicationId:string;allocationId:string;createdById:string;approvedAt:string|null;revokedAt:string|null}
export function PartnerApplicationScopes({session,overview,license}:{session:Session;overview:LicensingOverview;license:LicenseView|null}){
 const [applications,setApplications]=useState<App[]>([]),[scopes,setScopes]=useState<Scope[]>([]),[selected,setSelected]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[reload,setReload]=useState(0)
 const generation=useRef(0),writing=useRef(false),identity=licensingSessionKey(session)
 const current=()=>identity===licensingSessionKey(readLicensingSession())
 useEffect(()=>{const run=++generation.current;setScopes([]);setApplications([]);setError('');void api<{applications:App[];scopes:Scope[]}>('/licensing/societies/'+session.societyId+'/partner-applications',{cache:'no-store'},session).then(data=>{if(run!==generation.current||!current())return;if(!Array.isArray(data.applications)||data.applications.length>50||!Array.isArray(data.scopes)||data.scopes.length>100)throw Error('Invalid application scope response');setApplications(data.applications);setScopes(data.scopes);setSelected(old=>data.applications.some(a=>a.id===old)?old:data.applications[0]?.id??'')}).catch(e=>{if(run===generation.current&&current())setError(e instanceof Error?e.message:'Application scopes unavailable')});return()=>{++generation.current}},[session,reload])
 const mutate=async(action:'propose'|'approve'|'revoke',scope?:Scope)=>{
  if(writing.current||!current()||!selected||action!=='revoke'&&!license?.allocation?.active)return
  const run=generation.current,appId=scope?.applicationId??selected
  if(!await operatorConfirm(action==='propose'?'Propose this society for the partner TEST app?':action==='approve'?'Independently approve this society scope?':'Revoke this application’s society scope?')||run!==generation.current||!current())return
  writing.current=true;setBusy(true);setError('')
  const base='/licensing/societies/'+session.societyId+'/applications/'+appId+'/scopes'
  try{
   const body=action==='revoke'?undefined:JSON.stringify({grantId:license!.grantId,allocationId:license!.allocation!.id,expectedGrantVersion:license!.grantVersion,expectedOwnershipVersion:overview.society.ownershipVersion,idempotencyKey:crypto.randomUUID()})
   await api(action==='propose'?base:base+'/'+scope!.id+(action==='approve'?'/approve':''),{method:action==='revoke'?'DELETE':'POST',...(body?{body}:{})},session)
   if(run===generation.current&&current())setReload(old=>old+1)
  }catch(e){if(run===generation.current&&current())setError(e instanceof Error?e.message:'Application scope change failed')}
  finally{writing.current=false;if(current())setBusy(false)}
 }
 return <section className="panel"><h2>Partner TEST application scope</h2><p>Each society keeps its own permissions and licensed opt-in. A separate current platform operator must approve each proposal. Application sessions remain disabled until TEST configuration is explicitly enabled.</p>{error&&<p role="alert">{error}</p>}
  <label>Partner application<select value={selected} disabled={busy} onChange={e=>setSelected(e.target.value)}>{applications.map(a=><option key={a.id} value={a.id}>{a.applicationId} · {a.appRole}</option>)}</select></label>
  <button disabled={busy||!selected||!license?.allocation?.active} onClick={()=>void mutate('propose')}>Propose society scope</button>
  <ul>{scopes.map(scope=><li key={scope.id}>{applications.find(a=>a.id===scope.applicationId)?.applicationId??'Historical partner application'} · {scope.revokedAt?'Revoked':scope.approvedAt?'Approved':'Pending independent review'}
   {!scope.revokedAt&&!scope.approvedAt&&<button disabled={busy||!license?.allocation?.active||license.allocation.id!==scope.allocationId} onClick={()=>void mutate('approve',scope)}>Approve scope</button>}
   {!scope.revokedAt&&<button disabled={busy} onClick={()=>void mutate('revoke',scope)}>Revoke scope</button>}</li>)}</ul>
 </section>
}
