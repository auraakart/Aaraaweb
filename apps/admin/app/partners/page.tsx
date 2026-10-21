'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DetailPanel, EmptyState, ErrorState, PageHeader, PageShell, QueuePanel, SecondaryButton, SelectField, StatusPill } from '../../components/admin-ui'
import { api, type Session } from '../../lib/admin-client'
import { canReadMembers, parsePartnerMembers, parsePortfolio, parseWorkspaces, partnerSessionKey, readPartnerSession, type Portfolio, type Workspace } from '../../lib/admin-partner'

export default function PartnerPage(){
 const [session,setSession]=useState<Session|null>(null),[workspaces,setWorkspaces]=useState<Workspace[]>([]),[selected,setSelected]=useState(''),[portfolio,setPortfolio]=useState<Portfolio|null>(null)
 const [members,setMembers]=useState<ReturnType<typeof parsePartnerMembers>|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[hasMore,setHasMore]=useState(false)
 const generation=useRef(0),abort=useRef<AbortController|null>(null)
 const load=useCallback(async(s:Session,preferred:string)=>{
  const run=++generation.current,key=partnerSessionKey(s);abort.current?.abort();const controller=new AbortController();abort.current=controller
  setLoading(true);setError('');setPortfolio(null);setMembers(null);setWorkspaces([]);setHasMore(false)
  const current=()=>run===generation.current&&key===partnerSessionKey(readPartnerSession())&&!controller.signal.aborted
  try{
   const discovery=parseWorkspaces(await api<unknown>('/partners/workspaces',{signal:controller.signal,cache:'no-store'},s));if(!current())return
   const workspace=discovery.workspaces.find(w=>w.id===preferred)??discovery.workspaces[0]
   setWorkspaces(discovery.workspaces);setHasMore(discovery.hasMore);setSelected(workspace?.id??'')
   if(!workspace)return
   const init={signal:controller.signal,cache:'no-store' as const}
   const [rawPortfolio,rawMembers]=await Promise.all([api<unknown>(`/partners/${workspace.id}/portfolio`,init,s),canReadMembers(workspace)?api<unknown>(`/partners/${workspace.id}/members`,init,s):Promise.resolve(null)])
   if(!current())return
   const next=parsePortfolio(rawPortfolio,workspace.id),nextMembers=rawMembers===null?null:parsePartnerMembers(rawMembers)
   setPortfolio(next);setMembers(nextMembers)
  }catch(e){if(current()){setPortfolio(null);setMembers(null);setWorkspaces([]);setError(e instanceof Error?e.message:'Partner workspace unavailable')}}
  finally{if(current())setLoading(false)}
 },[])
 useEffect(()=>{
  const sync=()=>{const s=readPartnerSession();setSession(s);setSelected('');setPortfolio(null);setMembers(null);setWorkspaces([]);setError('');if(s)void load(s,'');else{++generation.current;abort.current?.abort();setLoading(false)}}
  sync();window.addEventListener('focus',sync);window.addEventListener('storage',sync)
  return()=>{++generation.current;abort.current?.abort();window.removeEventListener('focus',sync);window.removeEventListener('storage',sync)}
 },[load])
 const refresh=(id:string)=>{if(session&&partnerSessionKey(session)===partnerSessionKey(readPartnerSession()))void load(session,id)}
 return <PageShell><PageHeader title="Partner workspace" description="Review your commercial portfolio and partner roles." actions={<><a href="/">Admin console</a><a href="/partners/members">Manage partner members</a><a href="/partners/domains">Partner domains</a><a href="/partners/operations">Society operations overview</a>{!session&&<a href="/partners/login">Partner sign in</a>}<SecondaryButton disabled={loading||!session} onClick={()=>refresh(selected)}>Refresh</SecondaryButton></>}/>
  {error&&<ErrorState title="Partner access unavailable" description={error}/>}
  {loading?<p role="status">Loading partner workspace…</p>:!session?<EmptyState title="Sign in to continue" description="Sign in to your partner account to access commercial workspaces."/>:!workspaces.length&&!error?<EmptyState title="No partner workspace available" description="Your account has no active commercial workspace with portfolio access."/>:null}
  {!!workspaces.length&&<SelectField label="Partner workspace" value={selected} disabled={loading} onChange={e=>refresh(e.target.value)}>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</SelectField>}
  {hasMore&&<p>Showing up to 50 active role assignments.</p>}
  {portfolio&&<PageShell.Columns><QueuePanel title="Society portfolio" count={portfolio.societies.length} state={portfolio.societies.length?'ready':'empty'} empty={<EmptyState title="No societies assigned" description="Societies appear after an approved ownership assignment."/>}>
   <h3>{portfolio.partner.name}</h3>{portfolio.societies.map(s=><article key={s.id}><h4>{s.name}</h4><StatusPill label={s.status}/></article>)}{portfolio.hasMore&&<p>Showing the first 50 societies.</p>}
  </QueuePanel><DetailPanel title="Partner member roles">
   {members===null?<p>Your partner role does not allow member enumeration.</p>:members.length?members.map((m,i)=><article key={m.id}><h3>Role assignment {i+1}</h3><StatusPill label={m.role.replaceAll('_',' ')}/><p>Assigned {new Date(m.createdAt).toLocaleDateString('en-IN')}</p></article>):<p>No active member roles.</p>}
   {members?.length===50&&<p>Showing up to 50 active role assignments.</p>}
   <p>Partner roles do not grant access to resident contacts, gate activity or society finances.</p>
  </DetailPanel></PageShell.Columns>}
 </PageShell>
}
