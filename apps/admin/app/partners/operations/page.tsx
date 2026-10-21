'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { adminApi, getAdminSession, type AdminSession } from '../../../lib/aaraagate-api'
import { parseWorkspaces, type Workspace } from '../../../lib/admin-partner'
import { EmptyState, ErrorState, EvidenceGrid, PageHeader, PageShell, SecondaryButton, SelectField } from '../../../components/admin-ui'

type Summary={partnerId:string;societies:Array<{societyId:string;societyName:string;finance:{outstandingPaise:string;overdueReceivables:number}|null;helpdesk:{openTickets:number;overdueTickets:number}|null;facilities:{openWorkOrders:number;overdueWorkOrders:number}|null}>;hasMore:boolean;generatedAt:string}
const money=(value:string)=>`₹${(Number(value)/100).toLocaleString('en-IN',{maximumFractionDigits:2})}`

export default function PartnerOperations(){
 const [session,setSession]=useState<AdminSession|null>(null),[workspaces,setWorkspaces]=useState<Workspace[]>([]),[selected,setSelected]=useState(''),[summary,setSummary]=useState<Summary|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('')
 const generation=useRef(0)
 const load=useCallback(async(preferred='')=>{
  const s=getAdminSession(),run=++generation.current;setSession(s);setWorkspaces([]);setSummary(null);setError('');setLoading(true)
  const current=()=>run===generation.current&&getAdminSession()?.accessToken===s?.accessToken
  if(!s){setLoading(false);return}
  try{
   const discovered=parseWorkspaces(await adminApi<unknown>(s,'/partners/workspaces'))
   if(!current())return
   setWorkspaces(discovered.workspaces)
   const workspace=discovered.workspaces.find(w=>w.id===preferred)??discovered.workspaces[0];setSelected(workspace?.id??'')
   if(!workspace)return
   const result=await adminApi<Summary>(s,`/partners/${workspace.id}/operations`)
   if(!current())return
   if(result.partnerId!==workspace.id||!Array.isArray(result.societies)||result.societies.length>50)throw new Error('Operational summary scope is invalid')
   setSummary(result)
  }catch(e){if(current())setError(e instanceof Error?e.message:'Operational summary unavailable')}
  finally{if(current())setLoading(false)}
 },[])
 useEffect(()=>{const sync=()=>void load();sync();window.addEventListener('focus',sync);window.addEventListener('storage',sync);return()=>{++generation.current;window.removeEventListener('focus',sync);window.removeEventListener('storage',sync)}},[load])
 return <PageShell><PageHeader title="Society operations overview" description="Read-only summaries for societies where you separately hold current operational permissions." actions={<><a href="/partners">Partner workspace</a><a href="/">Society Admin sign in</a><SecondaryButton disabled={loading||!session} onClick={()=>void load(selected)}>Refresh overview</SecondaryButton></>}/>
  {error&&<ErrorState title="Overview unavailable" description={error}/>}
  {loading?<p role="status">Loading authorised summaries…</p>:!session?<EmptyState title="Society Admin sign in required" description="Commercial partner sessions do not grant access to operational metrics."/>:null}
  {!!workspaces.length&&<SelectField label="Partner portfolio" value={selected} disabled={loading} onChange={e=>void load(e.target.value)}>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</SelectField>}
  {!loading&&session&&!error&&(!summary||summary.societies.length===0)&&<EmptyState title="No authorised operational summaries" description="An active partner membership and separate society permissions are required. Unauthorised metrics are not disclosed."/>}
  {summary?.societies.map(row=><section key={row.societyId} style={{marginTop:20,padding:20,borderRadius:16,background:'var(--surface)',border:'1px solid var(--line)'}}><h2>{row.societyName}</h2><EvidenceGrid items={[
   ...(row.finance?[{id:'dues',label:'Outstanding receivables',value:money(row.finance.outstandingPaise)},{id:'overdue-dues',label:'Overdue receivables',value:String(row.finance.overdueReceivables)}]:[]),
   ...(row.helpdesk?[{id:'tickets',label:'Open complaints',value:String(row.helpdesk.openTickets)},{id:'overdue-tickets',label:'Overdue complaints',value:String(row.helpdesk.overdueTickets)}]:[]),
   ...(row.facilities?[{id:'work',label:'Open maintenance work',value:String(row.facilities.openWorkOrders)},{id:'overdue-work',label:'Overdue maintenance work',value:String(row.facilities.overdueWorkOrders)}]:[]),
  ]}/></section>)}
  {summary?.hasMore&&<p>Showing the first 50 authorised societies.</p>}
  {summary&&<p>Updated {new Date(summary.generatedAt).toLocaleString('en-IN')}. Figures are current totals, not a cash-collection percentage. Resident details and individual transactions are not included.</p>}
 </PageShell>
}
