'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { api, logoutAdminSession, refreshAdminSession, sessionFrom, type Session } from '../../lib/admin-client'

type Membership={societyId:string;role:string;society?:{name?:string;code?:string}}
type Summary={range:{from:string;to:string};access:{visitorRequests:number;visitorEntries:number;workforceEntries:number};maintenance:{billedCount:number;billedPaise:number|null;collectedCount:number;collectedPaise:number|null;outstandingCount:number;outstandingPaise:number|null};helpdesk:{open:number;inProgress:number;resolved:number;closed:number};audit:{eventCount:number}}
type SummaryComparison={current:Summary;previous:Summary}
type AuditItem={id:string;event:string;occurredAt:string;actorUserId:string;gateId?:string|null;accessRequestId?:string|null;visitorPassId?:string|null}
type MaintenanceItem={id:string;invoiceNumber:string;billingPeriod:string;amountPaise:number;dueDate:string;status:string;issuedAt:string;paidAt?:string|null;unit:{number:string;building:{name:string}}}
type Feed<T>={page:number;pageSize:number;total:number;items:T[]}

const isoDay=(date:Date)=>date.toISOString().slice(0,10)
const money=(paise:number|null)=>paise===null?'Restricted':new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(paise/100)

export default function AuditorWorkspace(){
  const[session,setSession]=useState<Session|null>(null),[restoring,setRestoring]=useState(true)
  useEffect(()=>{const raw=sessionStorage.getItem('aaraagate.admin.session');if(!raw){setRestoring(false);return}try{const stored=JSON.parse(raw) as Session;if(stored.role!=='AUDITOR'){setRestoring(false);return}refreshAdminSession(stored).then(setSession).catch(()=>sessionStorage.removeItem('aaraagate.admin.session')).finally(()=>setRestoring(false))}catch{sessionStorage.removeItem('aaraagate.admin.session');setRestoring(false)}},[])
  const accept=(next:Session)=>{sessionStorage.setItem('aaraagate.admin.session',JSON.stringify(next));setSession(next)}
  const logout=async()=>{if(session)await logoutAdminSession(session).catch(()=>undefined);sessionStorage.removeItem('aaraagate.admin.session');setSession(null)}
  if(restoring)return <main style={shell}><p>Restoring secure Auditor session…</p></main>
  if(!session)return <AuditorLogin onSession={accept}/>
  return <AuditDashboard session={session} onLogout={()=>void logout()}/>
}

function AuditorLogin({onSession}:{onSession:(session:Session)=>void}){
  const[stage,setStage]=useState<'phone'|'otp'|'society'>('phone'),[phone,setPhone]=useState('+91'),[otp,setOtp]=useState(''),[challenge,setChallenge]=useState(''),[userId,setUserId]=useState(''),[selectionToken,setSelectionToken]=useState(''),[memberships,setMemberships]=useState<Membership[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const run=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn()}catch(e){setError(e instanceof Error?e.message:'Authentication failed')}finally{setBusy(false)}}
  const send=(event:FormEvent)=>{event.preventDefault();void run(async()=>{const result=await api<{challengeId:string}>('/auth/otp/request',{method:'POST',body:JSON.stringify({phone:phone.trim()})});setChallenge(result.challengeId);setStage('otp')})}
  const verify=(event:FormEvent)=>{event.preventDefault();void run(async()=>{const result=await api<Record<string,unknown>>('/auth/otp/verify',{method:'POST',body:JSON.stringify({challengeId:challenge,code:otp})});const options=((result.memberships as Membership[])??[]).filter(m=>m.role==='AUDITOR');if(!options.length)throw new Error('No active read-only Auditor responsibility is assigned to this mobile number');setUserId(String(result.userId));setMemberships(options);if(result.session&&options.length===1)onSession(sessionFrom(result,options[0]));else{setSelectionToken(String(result.selectionToken??''));setStage('society')}})}
  const choose=(membership:Membership)=>void run(async()=>{const result=await api<Record<string,unknown>>('/auth/society/select',{method:'POST',body:JSON.stringify({userId,societyId:membership.societyId,selectionToken})});onSession(sessionFrom(result,membership))})
  return <main style={shell}><section style={loginCard}><div style={brand}>aaraagate</div><div style={pill}>READ-ONLY AUDITOR</div><h1 style={{marginBottom:8}}>Audit workspace</h1><p style={{marginTop:0,color:'#475569'}}>Society-scoped financial and operational evidence with no mutation authority.</p>{stage==='phone'&&<form onSubmit={send} style={form}><label style={label}>Mobile number<input style={input} value={phone} onChange={e=>setPhone(e.target.value)} required/></label><button style={primary} disabled={busy}>Send OTP</button></form>}{stage==='otp'&&<form onSubmit={verify} style={form}><label style={label}>6-digit OTP<input style={input} value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,'').slice(0,6))} minLength={6} maxLength={6} required/></label><button style={primary} disabled={busy||otp.length!==6}>Verify securely</button></form>}{stage==='society'&&<div style={{display:'grid',gap:10}}>{memberships.map(m=><button style={choice} key={m.societyId} onClick={()=>choose(m)}><strong>{m.society?.name??m.society?.code??'Society'}</strong><span>Read-only Auditor</span></button>)}</div>}{error&&<div role="alert" style={errorBox}>{error}</div>}</section></main>
}

function AuditDashboard({session,onLogout}:{session:Session;onLogout:()=>void}){
  const[to,setTo]=useState(()=>isoDay(new Date())),[from,setFrom]=useState(()=>isoDay(new Date(Date.now()-30*24*60*60*1000)))
  const[summary,setSummary]=useState<SummaryComparison|null>(null),[audit,setAudit]=useState<Feed<AuditItem>|null>(null),[maintenance,setMaintenance]=useState<Feed<MaintenanceItem>|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('')
  const load=useCallback(async()=>{setLoading(true);setError('');try{const query=`from=${encodeURIComponent(`${from}T00:00:00.000Z`)}&to=${encodeURIComponent(`${to}T23:59:59.999Z`)}`;const[summaryData,auditData,maintenanceData]=await Promise.all([api<SummaryComparison>(`/reports/summary/comparison?${query}`,{},session),api<Feed<AuditItem>>(`/reports/audit?page=1&pageSize=30&${query}`,{},session),api<Feed<MaintenanceItem>>(`/reports/maintenance?page=1&pageSize=15&${query}`,{},session)]);setSummary(summaryData);setAudit(auditData);setMaintenance(maintenanceData)}catch(e){setError(e instanceof Error?e.message:'Audit evidence could not be loaded')}finally{setLoading(false)}},[session,from,to])
  useEffect(()=>{void load()},[load])
  const current=summary?.current
  return <main style={shell}><header style={header}><div><div style={brand}>aaraagate</div><small style={{color:'#64748b'}}>{session.societyName} · READ-ONLY AUDITOR</small><h1 style={{margin:'6px 0'}}>Audit workspace</h1><p style={{margin:0,color:'#475569'}}>Evidence review only. This workspace has no society mutation permissions.</p></div><button style={secondary} onClick={onLogout}>Sign out</button></header><section style={filters}><label style={label}>From<input style={input} type="date" value={from} onChange={e=>setFrom(e.target.value)} max={to}/></label><label style={label}>To<input style={input} type="date" value={to} onChange={e=>setTo(e.target.value)} min={from} max={isoDay(new Date())}/></label><button style={primary} disabled={loading} onClick={()=>void load()}>{loading?'Refreshing…':'Refresh evidence'}</button></section>{error&&<div role="alert" style={errorBox}>{error}</div>}{current&&<><section style={metrics}><Metric label="Visitor entries" value={String(current.access.visitorEntries)}/><Metric label="Domestic-help entries" value={String(current.access.workforceEntries)}/><Metric label="Open helpdesk" value={String(current.helpdesk.open)}/><Metric label="Audit events" value={String(current.audit.eventCount)}/><Metric label="Billed" value={money(current.maintenance.billedPaise)}/><Metric label="Outstanding" value={money(current.maintenance.outstandingPaise)}/></section><section style={panel}><h2>Financial evidence</h2><p style={muted}>{maintenance?.total??0} maintenance records in the selected period.</p><div style={list}>{maintenance?.items.map(item=><article key={item.id} style={row}><div><strong>{item.invoiceNumber}</strong><div>{item.unit.building.name} · {item.unit.number} · {item.billingPeriod}</div><small>{item.status} · Due {new Date(item.dueDate).toLocaleDateString('en-IN')}</small></div><strong>{money(item.amountPaise)}</strong></article>)}</div>{maintenance?.items.length===0&&<p style={muted}>No maintenance records in this period.</p>}</section><section style={panel}><h2>Audit trail</h2><p style={muted}>{audit?.total??0} events in the selected period. Credentials, phone numbers and payment payloads are not exposed.</p><div style={list}>{audit?.items.map(item=><article key={item.id} style={row}><div><strong>{item.event.replaceAll('_',' ')}</strong><div>{new Date(item.occurredAt).toLocaleString('en-IN')}</div><small>Actor {item.actorUserId.slice(0,8)}…</small></div></article>)}</div>{audit?.items.length===0&&<p style={muted}>No audit events in this period.</p>}</section></>}</main>
}

function Metric({label:metricLabel,value}:{label:string;value:string}){return <article style={metric}><small style={{color:'#64748b'}}>{metricLabel}</small><strong style={{fontSize:22}}>{value}</strong></article>}

const shell:React.CSSProperties={maxWidth:1180,margin:'0 auto',padding:'32px 22px 80px',fontFamily:'system-ui,sans-serif',color:'#0f172a'}
const loginCard:React.CSSProperties={maxWidth:480,margin:'10vh auto 0',padding:28,border:'1px solid #dbe7ea',borderRadius:20,background:'white',boxShadow:'0 18px 48px rgba(15,23,42,.08)'}
const brand:React.CSSProperties={fontSize:18,fontWeight:800,color:'#05879A',letterSpacing:'.02em'}
const pill:React.CSSProperties={display:'inline-block',marginTop:18,padding:'6px 10px',borderRadius:999,background:'#e6f6f8',color:'#056b7a',fontSize:12,fontWeight:800}
const form:React.CSSProperties={display:'grid',gap:14,marginTop:20}
const label:React.CSSProperties={display:'grid',gap:6,fontSize:13,fontWeight:700,color:'#334155'}
const input:React.CSSProperties={padding:'11px 12px',border:'1px solid #cbd5e1',borderRadius:10,font:'inherit'}
const primary:React.CSSProperties={padding:'11px 15px',border:0,borderRadius:10,background:'#05879A',color:'white',fontWeight:800,cursor:'pointer'}
const secondary:React.CSSProperties={padding:'10px 14px',border:'1px solid #cbd5e1',borderRadius:10,background:'white',fontWeight:700,cursor:'pointer'}
const choice:React.CSSProperties={display:'grid',gap:3,textAlign:'left',padding:14,border:'1px solid #cbd5e1',borderRadius:12,background:'white',cursor:'pointer'}
const errorBox:React.CSSProperties={marginTop:16,padding:12,border:'1px solid #fecaca',borderRadius:10,background:'#fef2f2',color:'#991b1b'}
const header:React.CSSProperties={display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:18,flexWrap:'wrap'}
const filters:React.CSSProperties={display:'flex',alignItems:'end',gap:12,flexWrap:'wrap',marginTop:24,padding:16,border:'1px solid #dbe7ea',borderRadius:16,background:'white'}
const metrics:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12,marginTop:18}
const metric:React.CSSProperties={display:'grid',gap:6,padding:16,border:'1px solid #e2e8f0',borderRadius:14,background:'white'}
const panel:React.CSSProperties={marginTop:18,padding:20,border:'1px solid #dbe7ea',borderRadius:16,background:'white'}
const list:React.CSSProperties={display:'grid',gap:10,marginTop:12}
const row:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',padding:12,border:'1px solid #e2e8f0',borderRadius:12}
const muted:React.CSSProperties={color:'#64748b'}
