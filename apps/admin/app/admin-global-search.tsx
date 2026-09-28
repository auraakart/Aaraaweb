'use client'

import { FormEvent,useMemo,useState } from 'react'
import { api,type Session } from '../lib/admin-client'
import type { AdminView } from '../lib/admin-access'

type SearchResult={type:'MEMBER'|'VISITOR'|'INVOICE'|'HELPDESK'|'NOTICE'|'SERVICE'|'ASSET';id:string;title:string;subtitle?:string|null;path:string}
type SearchResponse={query:string;unitId?:string|null;results:SearchResult[]}
type Target={view?:AdminView;href?:string}
const occupancyRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER','COMMITTEE_MEMBER'])
const financeRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','ACCOUNTANT'])
const facilityReadRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER','COMMITTEE_MEMBER','AUDITOR'])

function targetFor(result:SearchResult,role:string,allowedViews:readonly AdminView[]):Target|null{
  const has=(view:AdminView)=>allowedViews.includes(view)
  switch(result.type){
    case 'MEMBER': return has('residents')?{view:'residents'}:occupancyRoles.has(role)?{href:'/occupancy-lifecycle'}:null
    case 'VISITOR': return has('gates')?{view:'gates'}:null
    case 'INVOICE': return has('billing')?{view:'billing'}:financeRoles.has(role)?{href:'/finance'}:null
    case 'HELPDESK': return has('helpdesk')?{view:'helpdesk'}:null
    case 'NOTICE': return has('notices')?{view:'notices'}:null
    case 'SERVICE': return has('marketplace')?{view:'marketplace'}:null
    case 'ASSET': return facilityReadRoles.has(role)?{href:'/facilities'}:null
  }
}

export function AdminGlobalSearch({session,allowedViews,open}:{session:Session;allowedViews:AdminView[];open:(view:AdminView)=>void}){
  const[q,setQ]=useState(''),[results,setResults]=useState<SearchResult[]>([]),[searched,setSearched]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const visible=useMemo(()=>results.map(result=>({result,target:targetFor(result,session.role,allowedViews)})).filter(item=>item.target!==null),[results,session.role,allowedViews])
  const submit=async(e:FormEvent)=>{e.preventDefault();const query=q.trim();if(query.length<2){setError('Enter at least 2 characters.');return}setBusy(true);setError('');try{const body=await api<SearchResponse>(`/search?q=${encodeURIComponent(query)}`,{},session);setResults(body.results);setSearched(true)}catch(err){setResults([]);setSearched(true);setError(err instanceof Error?err.message:'Search could not be completed')}finally{setBusy(false)}}
  const activate=(target:Target)=>{if(target.view){open(target.view);setResults([]);setSearched(false);return}if(target.href)window.location.assign(target.href)}
  return <section className="panel" aria-label="Admin search" style={{marginBottom:18}}>
    <form onSubmit={submit} className="toolbar" style={{alignItems:'end'}}>
      <label style={{display:'grid',gap:6,flex:'1 1 320px'}}><span><b>Find in this society</b></span><input value={q} onChange={e=>{setQ(e.target.value);setSearched(false)}} minLength={2} maxLength={100} placeholder="Resident, visitor, invoice, complaint, notice, service or asset"/></label>
      <button className="primary" disabled={busy}>{busy?'Searching…':'Search'}</button>
    </form>
    <small>Results are permission-scoped by the server and only routed to Admin surfaces available to your current role.</small>
    {error&&<div className="error" role="alert" style={{marginTop:10}}>{error}</div>}
    {searched&&visible.length===0&&!error&&<p>No accessible Admin results for “{q.trim()}”.</p>}
    {visible.length>0&&<div className="relationshipGrid" style={{marginTop:12}}>{visible.map(({result,target})=><button type="button" className="row" key={`${result.type}:${result.id}`} onClick={()=>activate(target!)}><div><b>{result.title}</b><span>{result.type.replaceAll('_',' ')}{result.subtitle?` · ${result.subtitle}`:''}</span></div><span aria-hidden="true">→</span></button>)}</div>}
  </section>
}
