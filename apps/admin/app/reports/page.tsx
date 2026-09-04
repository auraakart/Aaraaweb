'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type Session={sessionId:string;accessToken:string;refreshToken:string;societyId:string;role:string;societyName:string}
type Summary={range:{from:string;to:string};access:{visitorRequests:number;visitorEntries:number;workforceEntries:number};maintenance:{billedCount:number;billedPaise:number;collectedCount:number;collectedPaise:number;outstandingCount:number;outstandingPaise:number};helpdesk:{open:number;inProgress:number;resolved:number;closed:number};audit:{eventCount:number}}
type AuditItem={id:string;event:string;occurredAt:string;actorUserId:string;gateId?:string|null;accessRequestId?:string|null;visitorPassId?:string|null}
type AuditFeed={page:number;pageSize:number;total:number;items:AuditItem[]}

const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
const auditRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER'])

async function api<T>(path:string,session:Session):Promise<T>{
  const response=await fetch(`${base}/api/v1${path}`,{headers:{Accept:'application/json',Authorization:`Bearer ${session.accessToken}`}})
  const text=await response.text();const body=text?JSON.parse(text) as unknown:null
  if(!response.ok){const message=body&&typeof body==='object'&&'message'in body?String((body as {message:unknown}).message):`Request failed (${response.status})`;throw new Error(message)}
  return body as T
}

const currency=(paise:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(paise/100)
const isoDay=(date:Date)=>date.toISOString().slice(0,10)

export default function ReportsPage(){
  const[session,setSession]=useState<Session|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[summary,setSummary]=useState<Summary|null>(null),[audit,setAudit]=useState<AuditFeed|null>(null),[page,setPage]=useState(1)
  const[to,setTo]=useState(()=>isoDay(new Date())),[from,setFrom]=useState(()=>isoDay(new Date(Date.now()-30*24*60*60*1000)))

  useEffect(()=>{try{const raw=sessionStorage.getItem('aaraagate.admin.session');if(!raw){setError('Sign in to the Admin console before opening reports.');setLoading(false);return}setSession(JSON.parse(raw) as Session)}catch{setError('Admin session could not be restored.');setLoading(false)}},[])
  const canAudit=useMemo(()=>!!session&&auditRoles.has(session.role),[session])
  const load=useCallback(async(currentPage=1)=>{if(!session)return;setLoading(true);setError('');try{const query=`?from=${encodeURIComponent(`${from}T00:00:00.000Z`)}&to=${encodeURIComponent(`${to}T23:59:59.999Z`)}`;const [s,a]=await Promise.all([api<Summary>(`/reports/summary${query}`,session),canAudit?api<AuditFeed>(`/reports/audit?page=${currentPage}&pageSize=25`,session):Promise.resolve(null)]);setSummary(s);setAudit(a);setPage(currentPage)}catch(e){setError(e instanceof Error?e.message:'Reports could not be loaded')}finally{setLoading(false)}},[session,from,to,canAudit])
  useEffect(()=>{if(session)void load(1)},[session,load])

  if(!session&&!loading)return <main className="login"><section className="loginCard"><div className="brand">aaraagate</div><h1>Reports unavailable</h1><div className="error">{error}</div><a href="/">Return to Admin sign in</a></section></main>
  return <main className="content" style={{maxWidth:1200,margin:'0 auto',padding:'32px 24px'}}><header><small>{session?.societyName??'Society'} · {session?.role.replaceAll('_',' ')}</small><h1>Operational reports</h1><p>Society-scoped V1 summaries and privacy-safe audit activity.</p><a href="/">← Back to operations</a></header><section className="panel form" style={{marginTop:20}}><label>From<input type="date" value={from} onChange={e=>setFrom(e.target.value)} max={to}/></label><label>To<input type="date" value={to} onChange={e=>setTo(e.target.value)} min={from} max={isoDay(new Date())}/></label><button className="primary" disabled={loading} onClick={()=>void load(1)}>{loading?'Loading…':'Refresh report'}</button></section>{error&&<div className="error">{error}</div>}{summary&&<><div className="grid" style={{marginTop:20}}><Metric label="Visitor requests" value={summary.access.visitorRequests}/><Metric label="Visitor entries" value={summary.access.visitorEntries}/><Metric label="Domestic-help entries" value={summary.access.workforceEntries}/><Metric label="Audit events" value={summary.audit.eventCount}/></div><div className="relationshipGrid" style={{marginTop:20}}><section className="panel"><h2>Maintenance</h2><ReportRow label="Billed" value={`${summary.maintenance.billedCount} · ${currency(summary.maintenance.billedPaise)}`}/><ReportRow label="Collected" value={`${summary.maintenance.collectedCount} · ${currency(summary.maintenance.collectedPaise)}`}/><ReportRow label="Outstanding" value={`${summary.maintenance.outstandingCount} · ${currency(summary.maintenance.outstandingPaise)}`}/></section><section className="panel"><h2>Helpdesk</h2><ReportRow label="Open" value={String(summary.helpdesk.open)}/><ReportRow label="In progress" value={String(summary.helpdesk.inProgress)}/><ReportRow label="Resolved" value={String(summary.helpdesk.resolved)}/><ReportRow label="Closed" value={String(summary.helpdesk.closed)}/></section></div><p><small>Range: {new Date(summary.range.from).toLocaleDateString('en-IN')} – {new Date(summary.range.to).toLocaleDateString('en-IN')}</small></p></>}{canAudit&&<section className="panel" style={{marginTop:20}}><div className="toolbar"><div><h2>Audit activity</h2><p>Identifiers only; no visitor credentials, phone numbers or payment payloads are exposed.</p></div>{audit&&<span>{audit.total} events</span>}</div>{audit?.items.length?audit.items.map(item=><article className="relationshipCard" key={item.id}><div><b>{item.event.replaceAll('_',' ')}</b><span>{new Date(item.occurredAt).toLocaleString('en-IN')} · Actor {item.actorUserId.slice(0,8)}…</span><small>{[item.gateId&&`Gate ${item.gateId.slice(0,8)}…`,item.accessRequestId&&`Access ${item.accessRequestId.slice(0,8)}…`,item.visitorPassId&&`Pass ${item.visitorPassId.slice(0,8)}…`].filter(Boolean).join(' · ')||'General audit event'}</small></div></article>):!loading&&<div className="empty">No audit events</div>}{audit&&<div className="buttons" style={{marginTop:16}}><button disabled={page<=1||loading} onClick={()=>void load(page-1)}>Previous</button><span>Page {page} of {Math.max(1,Math.ceil(audit.total/audit.pageSize))}</span><button disabled={page* audit.pageSize>=audit.total||loading} onClick={()=>void load(page+1)}>Next</button></div>}</section>}</main>
}

function Metric({label,value}:{label:string;value:number}){return <div className="metric"><span>{label}</span><b>{value}</b></div>}
function ReportRow({label,value}:{label:string;value:string}){return <div className="relationshipCard"><span>{label}</span><b>{value}</b></div>}
