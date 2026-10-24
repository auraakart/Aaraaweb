'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {api,type Session} from '../../../lib/admin-client'
import {parseWorkspaces,partnerSessionKey,readPartnerSession,type Workspace} from '../../../lib/admin-partner'
import {parsePartnerReadiness,type PartnerReadiness} from '../../../lib/admin-partner-brand'
import {PartnerPresentationEditor} from '../../../components/partner-presentation-editor'
import {PartnerApplicationRegistration} from '../../../components/partner-application-registration'
export default function PartnerBrandingPage(){
 const [session,setSession]=useState<Session|null>(null),[workspaces,setWorkspaces]=useState<Workspace[]>([]),[selected,setSelected]=useState(''),[readiness,setReadiness]=useState<PartnerReadiness|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true)
 const generation=useRef(0)
 const load=useCallback(async(s:Session,preferred:string)=>{
  const run=++generation.current,identity=partnerSessionKey(s)
  const current=()=>run===generation.current&&identity===partnerSessionKey(readPartnerSession())
  setLoading(true);setError('');setReadiness(null);setWorkspaces([])
  try{
   const discovered=parseWorkspaces(await api('/partners/workspaces',{cache:'no-store'},s))
   if(!current())return
   const workspace=discovered.workspaces.find(w=>w.id===preferred)??discovered.workspaces[0]
   setWorkspaces(discovered.workspaces);setSelected(workspace?.id??'')
   if(workspace){const raw=await api('/partners/'+workspace.id+'/readiness',{cache:'no-store'},s);if(current())setReadiness(parsePartnerReadiness(raw,workspace.id))}
  }catch(e){if(current()){setReadiness(null);setError(e instanceof Error?e.message:'Partner readiness unavailable')}}
  finally{if(current())setLoading(false)}
 },[])
 useEffect(()=>{
  const sync=()=>{const next=readPartnerSession();++generation.current;setSession(next);setSelected('');setReadiness(null);setWorkspaces([]);setError('');if(next)void load(next,'');else setLoading(false)}
  sync();window.addEventListener('storage',sync);window.addEventListener('focus',sync)
  return()=>{++generation.current;window.removeEventListener('storage',sync);window.removeEventListener('focus',sync)}
 },[load])
 const workspace=workspaces.find(w=>w.id===selected),canEdit=!!workspace?.roles.some(r=>r==='OWNER'||r==='BRAND_MANAGER')
 const refresh=()=>{if(session)void load(session,selected)}
 return <main className="content"><h1>Partner branding and readiness</h1><nav><a href="/partners">Partner workspace</a> · <a href="/partners/domains">Domains</a> · <a href="/licensing">Society licensing and application scope</a></nav>
  {error&&<p role="alert">{error}</p>}{loading&&<p role="status">Loading readiness…</p>}
  {!session&&!loading&&<a href="/partners/login">Sign in to your partner workspace</a>}
  {!!workspaces.length&&<label>Partner workspace<select value={selected} disabled={loading} onChange={e=>session&&void load(session,e.target.value)}>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>}
  {readiness&&session&&<><section className="panel"><h2>Readiness</h2><p>Brand: {readiness.branding.published?'Published revision '+readiness.branding.version:'No published partner brand'}</p><p>License: {readiness.licensing.ambiguous?'Ambiguous active grants — review required':readiness.licensing.approvedActiveGrant?'Current approved active grant':'No current approved active grant'}. Society opt-in is checked separately.</p><p>Verified domains: {readiness.domains.verified} · Expiring within 7 days: {readiness.domains.expiringSoon}</p><p>Application scopes: {readiness.scopes.pending} awaiting independent approval · {readiness.scopes.approved} approved records requiring current license revalidation</p>
   <ul>{readiness.applications.map(a=><li key={a.id}>{a.applicationId} · {a.appRole} · TEST push route {a.pushRouteConfigured?'configured':'missing'}</li>)}</ul>{readiness.hasMoreApplications&&<p>Showing the first 50 applications.</p>}
   <p>Independent worker, devices, signing and live providers: on hold. Build dispatch is disabled. These records do not establish production acceptance.</p><button onClick={refresh}>Refresh readiness</button></section>
   <PartnerPresentationEditor key={'brand:'+partnerSessionKey(session)+selected} session={session} partnerId={selected} canEdit={canEdit} onSaved={refresh}/>
   {canEdit&&<PartnerApplicationRegistration key={'app:'+partnerSessionKey(session)+selected} session={session} partnerId={selected} onSaved={refresh}/>}</>}
 </main>
}
