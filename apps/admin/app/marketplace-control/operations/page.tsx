'use client'

import { useCallback, useEffect, useState } from 'react'

type Session={accessToken:string;role:string}
type Summary={windowDays:number;bookings30d:number;completed30d:number;cancelled30d:number;completionRate30d:number;cancellationRate30d:number;activeVerifiedProviders:number;activeCommercialPlacements:number;repeatCustomers90d:number}
const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
function storedSession():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw) as Session:null}catch{return null}}
async function loadSummary(s:Session):Promise<Summary>{const r=await fetch(`${base}/api/v1/platform/services/operations/summary`,{headers:{Accept:'application/json',Authorization:`Bearer ${s.accessToken}`}});const text=await r.text();const body=text?JSON.parse(text):null;if(!r.ok)throw new Error(body?.message??`Request failed (${r.status})`);return body as Summary}
function percent(value:number){return `${(value*100).toFixed(1)}%`}

export default function ExternalServicesOperationsPage(){
  const[session,setSession]=useState<Session|null>(null),[summary,setSummary]=useState<Summary|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('')
  const load=useCallback(async(s:Session)=>{setLoading(true);setError('');try{setSummary(await loadSummary(s))}catch(e){setError(e instanceof Error?e.message:'Operations summary could not be loaded')}finally{setLoading(false)}},[])
  useEffect(()=>{const s=storedSession();setSession(s);if(s?.role==='SUPER_ADMIN')void load(s);else setLoading(false)},[load])
  if(loading)return <main style={{padding:32}}>Loading External Services operations…</main>
  if(session?.role!=='SUPER_ADMIN')return <main style={{padding:32}}><h1>Super Admin access required</h1><p>External Services pilot telemetry is platform-only and read-only.</p><a href="/">Return to Admin</a></main>
  return <main style={{maxWidth:1180,margin:'0 auto',padding:'28px 22px 80px'}}>
    <header style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap'}}><div><small>Platform marketplace · pilot readiness</small><h1 style={{margin:'4px 0'}}>External Services operations</h1><p style={{margin:0,maxWidth:760}}>Read-only pilot health from marketplace system-of-record data. These metrics do not change bookings, provider trust, paid placement, payments or ranking.</p></div><div style={{display:'flex',gap:10,flexWrap:'wrap'}}><button onClick={()=>void load(session)} style={button}>Refresh</button><a href="/marketplace-control/commercial" style={linkButton}>Commercial controls</a><a href="/" style={linkButton}>Admin console</a></div></header>
    {error&&<div style={errorBox}>{error}</div>}
    {!summary&&!error?<section style={panel}><p>No operations data is available yet.</p></section>:summary&&<>
      <section style={{...panel,display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12}}>
        <Metric label={`Bookings · ${summary.windowDays}d`} value={summary.bookings30d.toLocaleString('en-IN')} hint="Created bookings"/>
        <Metric label="Completion rate" value={percent(summary.completionRate30d)} hint={`${summary.completed30d.toLocaleString('en-IN')} completed`}/>
        <Metric label="Cancellation rate" value={percent(summary.cancellationRate30d)} hint={`${summary.cancelled30d.toLocaleString('en-IN')} cancelled`}/>
        <Metric label="Verified providers" value={summary.activeVerifiedProviders.toLocaleString('en-IN')} hint="Active and verified"/>
        <Metric label="Paid placements" value={summary.activeCommercialPlacements.toLocaleString('en-IN')} hint="Active Featured / Sponsored"/>
        <Metric label="Repeat customers · 90d" value={summary.repeatCustomers90d.toLocaleString('en-IN')} hint="2+ completed services"/>
      </section>
      <section style={panel}><h2 style={{marginTop:0}}>Pilot interpretation</h2><div style={{display:'grid',gap:10}}><Signal title="Demand" text={`${summary.bookings30d.toLocaleString('en-IN')} bookings were created in the last ${summary.windowDays} days.`}/><Signal title="Fulfilment" text={`${summary.completed30d.toLocaleString('en-IN')} completed and ${summary.cancelled30d.toLocaleString('en-IN')} cancelled; track the trend before enabling commission or heavier automation.`}/><Signal title="Supply" text={`${summary.activeVerifiedProviders.toLocaleString('en-IN')} active verified providers are currently eligible for marketplace participation.`}/><Signal title="Retention" text={`${summary.repeatCustomers90d.toLocaleString('en-IN')} customers completed at least two services in the last 90 days.`}/></div></section>
      <section style={note}><strong>Read-only boundary</strong><p style={{margin:'6px 0 0'}}>This dashboard intentionally has no mutation actions. Provider verification, society approval, commercial placement, bookings and payments remain in their existing permission-protected workflows.</p></section>
    </>}
  </main>
}
function Metric({label,value,hint}:{label:string;value:string;hint:string}){return <article style={metric}><small>{label}</small><strong style={{fontSize:28,lineHeight:1.2}}>{value}</strong><span style={{fontSize:13,color:'#475569'}}>{hint}</span></article>}
function Signal({title,text}:{title:string;text:string}){return <div style={{padding:14,border:'1px solid #e2e8f0',borderRadius:12}}><strong>{title}</strong><p style={{margin:'5px 0 0'}}>{text}</p></div>}
const panel:React.CSSProperties={marginTop:20,padding:20,border:'1px solid #dbe7ea',borderRadius:16,background:'white'}
const metric:React.CSSProperties={display:'grid',gap:6,padding:16,border:'1px solid #e2e8f0',borderRadius:14,background:'#f8fafc'}
const button:React.CSSProperties={padding:'10px 13px',borderRadius:10,border:'1px solid #05879A',background:'#05879A',color:'white',fontWeight:700,cursor:'pointer'}
const linkButton:React.CSSProperties={padding:'10px 13px',borderRadius:10,border:'1px solid #cbd5e1',background:'white',color:'#111827',fontWeight:700,textDecoration:'none'}
const errorBox:React.CSSProperties={marginTop:18,padding:12,border:'1px solid #ef4444',borderRadius:10}
const note:React.CSSProperties={marginTop:20,padding:16,border:'1px solid #bae6fd',borderRadius:14,background:'#f0f9ff'}
