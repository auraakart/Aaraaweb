'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'

type Session={accessToken:string;role:string;societyName?:string}
type Receivable={id:string;unitId:string;receivableNumber:string;billingPeriod:string;description:string;amountPaise:string;outstandingPaise:string;dueDate:string;status:string;issuedAt:string}
type Ageing={currentPaise:string;days1To30Paise:string;days31To60Paise:string;days61To90Paise:string;days90PlusPaise:string}
type Rule={id:string;code:string;name:string;frequency:string;amountPaise:string;lateFeeMode:string;graceDays:number;active:boolean}
type Journal={id:string;entryNumber:string;entryDate:string;description:string;status:string;debitPaise:string;creditPaise:string;postedAt?:string|null}
type Period={id:string;code:string;name:string;startsOn:string;endsOn:string;status:string}
type LatePreview={receivableId:string;receivableNumber:string;outstandingPaise:string;feePaise:string;lateFeeMode:string;dueDate:string}[]
type LateBatch={id:string;asOfDate:string;status:string;assessmentCount?:number;totalFeePaise?:string;createdAt?:string}
type Unapplied={paymentCount?:number;totalCapturedPaise?:string;totalAllocatedPaise?:string;totalUnappliedPaise?:string;payments?:Array<{paymentId:string;amountPaise:string;allocatedPaise:string;unappliedPaise:string}>}
type PaymentAvailability={paymentId:string;status:string;amountPaise:string;allocatedPaise:string;unallocatedPaise:string}
type Allocation={id:string;receivableId:string;amountPaise:string;allocatedAt:string}

const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
function getSession():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw) as Session:null}catch{return null}}
async function api<T>(s:Session,path:string,init:RequestInit={}):Promise<T>{const r=await fetch(`${base}/api/v1${path}`,{...init,headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.accessToken}`,...init.headers}});const t=await r.text();const b=t?JSON.parse(t):null;if(!r.ok)throw new Error(Array.isArray(b?.message)?b.message.join(', '):b?.message??`Request failed (${r.status})`);return b as T}
const readRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','ACCOUNTANT'])
const manageRoles=new Set(['SUPER_ADMIN','ACCOUNTANT'])
const money=(v:string|number|undefined)=>`₹${(Number(v??0)/100).toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:2})}`
const today=()=>new Date().toISOString().slice(0,10)

export default function FinanceWorkspace(){
  const[session,setSession]=useState<Session|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const[receivables,setReceivables]=useState<Receivable[]>([]),[ageing,setAgeing]=useState<Ageing|null>(null),[rules,setRules]=useState<Rule[]>([]),[journals,setJournals]=useState<Journal[]>([]),[periods,setPeriods]=useState<Period[]>([])
  const[latePreview,setLatePreview]=useState<LatePreview>([]),[batches,setBatches]=useState<LateBatch[]>([]),[unapplied,setUnapplied]=useState<Unapplied|null>(null)
  const[asOf,setAsOf]=useState(today()),[paymentId,setPaymentId]=useState(''),[payment,setPayment]=useState<PaymentAvailability|null>(null),[allocations,setAllocations]=useState<Allocation[]>([])
  const[allocationReceivable,setAllocationReceivable]=useState(''),[allocationAmount,setAllocationAmount]=useState('')
  const canRead=(s:Session|null)=>!!s&&readRoles.has(s.role), canManage=!!session&&manageRoles.has(session.role)

  const load=useCallback(async(s:Session)=>{setLoading(true);setError('');try{const[r,a,cr,j,p,lb,u]=await Promise.all([
    api<Receivable[]>(s,'/accounting/receivables'),api<Ageing>(s,`/accounting/receivables/ageing?asOf=${today()}`),api<Rule[]>(s,'/accounting/receivables/charge-rules'),api<Journal[]>(s,'/accounting/journals'),api<Period[]>(s,'/accounting/periods'),api<LateBatch[]>(s,'/accounting/late-fees/batches'),api<Unapplied>(s,'/accounting/late-fees/unapplied-cash')]);setReceivables(r);setAgeing(a);setRules(cr);setJournals(j);setPeriods(p);setBatches(lb);setUnapplied(u)}catch(e){setError(e instanceof Error?e.message:'Could not load finance workspace')}finally{setLoading(false)}},[])
  useEffect(()=>{const s=getSession();setSession(s);if(s&&canRead(s))void load(s);else setLoading(false)},[load])

  const overdue=useMemo(()=>receivables.filter(r=>Number(r.outstandingPaise)>0&&r.dueDate.slice(0,10)<today()),[receivables])
  const totalOutstanding=useMemo(()=>receivables.reduce((n,r)=>n+Math.max(0,Number(r.outstandingPaise)),0),[receivables])
  const settled=receivables.filter(r=>r.status==='SETTLED').length

  async function previewLateFees(){if(!session)return;setBusy(true);setError('');try{setLatePreview(await api<LatePreview>(session,`/accounting/late-fees/preview?asOf=${asOf}`))}catch(e){setError(e instanceof Error?e.message:'Could not preview late fees')}finally{setBusy(false)}}
  async function applyLateFees(){if(!session||!canManage)return;if(!confirm(`Apply late fees as of ${asOf}? This will post accounting journals.`))return;setBusy(true);setError('');try{await api(session,'/accounting/late-fees/apply',{method:'POST',body:JSON.stringify({asOfDate:asOf,entryDate:today(),idempotencyKey:`late-fee-${asOf}`,journalPrefix:`LF-${asOf.replaceAll('-','')}`})});setLatePreview([]);await load(session)}catch(e){setError(e instanceof Error?e.message:'Could not apply late fees')}finally{setBusy(false)}}
  async function inspectPayment(e:FormEvent){e.preventDefault();if(!session||!paymentId.trim())return;setBusy(true);setError('');try{const[p,a]=await Promise.all([api<PaymentAvailability>(session,`/accounting/settlements/payments/${paymentId.trim()}/availability`),api<Allocation[]>(session,`/accounting/settlements/payments/${paymentId.trim()}/allocations`)]);setPayment(p);setAllocations(a)}catch(e){setPayment(null);setAllocations([]);setError(e instanceof Error?e.message:'Could not inspect payment')}finally{setBusy(false)}}
  async function allocate(e:FormEvent){e.preventDefault();if(!session||!canManage||!payment||!allocationReceivable)return;const rupees=Number(allocationAmount);if(!Number.isFinite(rupees)||rupees<=0){setError('Enter a positive allocation amount.');return}setBusy(true);setError('');try{await api(session,`/accounting/settlements/receivables/${allocationReceivable}/allocate`,{method:'POST',body:JSON.stringify({paymentId:payment.paymentId,amountPaise:Math.round(rupees*100),idempotencyKey:`admin-${payment.paymentId}-${allocationReceivable}-${Math.round(rupees*100)}`})});setAllocationAmount('');await inspectPayment({preventDefault(){}} as FormEvent);await load(session)}catch(e){setError(e instanceof Error?e.message:'Could not allocate payment')}finally{setBusy(false)}}

  if(loading)return <main style={{padding:32}}>Loading finance workspace…</main>
  if(!canRead(session))return <main style={{padding:32}}><h1>Finance access required</h1><p>Accountant/Treasurer, Committee, Society Admin or platform finance access is required.</p><a href="/">Return to Admin</a></main>
  return <main style={{maxWidth:1240,margin:'0 auto',padding:'28px 22px 80px'}}>
    <header style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap'}}><div><small>{session?.societyName??'Current society'} · {session?.role.replaceAll('_',' ')}</small><h1 style={{margin:'4px 0'}}>Finance workspace</h1><p style={{margin:0}}>Receivables, ageing, settlements, late fees and accounting controls.</p></div><div style={{display:'flex',gap:10}}><button style={secondary} disabled={busy} onClick={()=>session&&void load(session)}>Refresh</button><a href="/" style={linkButton}>← Admin console</a></div></header>
    {error&&<div style={errorBox}>{error}</div>}
    {!canManage&&<div style={notice}>Read-only finance access. Posting, allocation and late-fee actions are restricted to Accountant/Treasurer or platform finance roles.</div>}

    <section style={metricGrid}>
      <Metric label="Outstanding" value={money(totalOutstanding)}/><Metric label="Open receivables" value={String(receivables.filter(r=>Number(r.outstandingPaise)>0).length)}/><Metric label="Overdue" value={String(overdue.length)}/><Metric label="Settled" value={String(settled)}/><Metric label="Unapplied cash" value={money(unapplied?.totalUnappliedPaise)}/>
    </section>

    <section style={panel}><h2 style={{marginTop:0}}>Ageing</h2>{ageing?<div style={metricGrid}><Metric label="Current" value={money(ageing.currentPaise)}/><Metric label="1–30 days" value={money(ageing.days1To30Paise)}/><Metric label="31–60 days" value={money(ageing.days31To60Paise)}/><Metric label="61–90 days" value={money(ageing.days61To90Paise)}/><Metric label="90+ days" value={money(ageing.days90PlusPaise)}/></div>:<p>No ageing data.</p>}</section>

    <section style={panel}><div style={sectionHeader}><div><h2 style={{margin:'0 0 4px'}}>Receivables</h2><small>{receivables.length} recent records</small></div></div>{receivables.length===0?<p>No receivables issued yet.</p>:<div style={{overflowX:'auto'}}><table style={table}><thead><tr><th>Number</th><th>Period</th><th>Due</th><th>Status</th><th style={right}>Charge</th><th style={right}>Outstanding</th></tr></thead><tbody>{receivables.slice(0,100).map(r=><tr key={r.id}><td><b>{r.receivableNumber}</b><div><small>{r.description}</small></div></td><td>{r.billingPeriod}</td><td>{new Date(r.dueDate).toLocaleDateString('en-IN')}</td><td>{r.status.replaceAll('_',' ')}</td><td style={right}>{money(r.amountPaise)}</td><td style={right}><b>{money(r.outstandingPaise)}</b></td></tr>)}</tbody></table></div>}</section>

    <section style={panel}><div style={sectionHeader}><div><h2 style={{margin:'0 0 4px'}}>Late-fee control</h2><small>Preview first; posting is explicit and auditable.</small></div><div style={{display:'flex',gap:8,alignItems:'end'}}><label>As of<input type="date" value={asOf} onChange={e=>setAsOf(e.target.value)} style={input}/></label><button disabled={busy} onClick={()=>void previewLateFees()} style={secondary}>Preview</button>{canManage&&<button disabled={busy||latePreview.length===0} onClick={()=>void applyLateFees()} style={primary}>Apply batch</button>}</div></div>{latePreview.length>0&&<div style={{marginTop:14}}><b>{latePreview.length} eligible receivable{latePreview.length===1?'':'s'}</b><div style={{display:'grid',gap:8,marginTop:8}}>{latePreview.slice(0,30).map(x=><div key={x.receivableId} style={row}><span>{x.receivableNumber} · due {new Date(x.dueDate).toLocaleDateString('en-IN')}</span><span>{money(x.outstandingPaise)} → <b>{money(x.feePaise)} fee</b></span></div>)}</div></div>}<div style={{marginTop:18}}><small>Recent batches</small>{batches.length===0?<p>No late-fee batches yet.</p>:batches.slice(0,10).map(b=><div key={b.id} style={row}><span>{new Date(b.asOfDate).toLocaleDateString('en-IN')} · {b.status}</span><span>{b.assessmentCount??0} assessments · {money(b.totalFeePaise)}</span></div>)}</div></section>

    <section style={panel}><h2 style={{marginTop:0}}>Payment allocation</h2><p>Inspect a captured payment and allocate only its available amount to an open receivable.</p><form onSubmit={inspectPayment} style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'end'}}><label style={{minWidth:320,flex:1}}>Payment ID<input value={paymentId} onChange={e=>setPaymentId(e.target.value)} placeholder="UUID" style={input}/></label><button disabled={busy||!paymentId.trim()} style={secondary}>Inspect payment</button></form>{payment&&<div style={{marginTop:16}}><div style={metricGrid}><Metric label="Payment amount" value={money(payment.amountPaise)}/><Metric label="Allocated" value={money(payment.allocatedPaise)}/><Metric label="Available" value={money(payment.unallocatedPaise)}/></div>{canManage&&<form onSubmit={allocate} style={{display:'grid',gridTemplateColumns:'2fr 1fr auto',gap:10,alignItems:'end',marginTop:14}}><label>Receivable<select value={allocationReceivable} onChange={e=>setAllocationReceivable(e.target.value)} style={input}><option value="">Choose open receivable</option>{receivables.filter(r=>Number(r.outstandingPaise)>0).map(r=><option key={r.id} value={r.id}>{r.receivableNumber} · {money(r.outstandingPaise)}</option>)}</select></label><label>Amount (₹)<input type="number" min="0.01" step="0.01" value={allocationAmount} onChange={e=>setAllocationAmount(e.target.value)} style={input}/></label><button disabled={busy||!allocationReceivable||!allocationAmount} style={primary}>Allocate</button></form>}<div style={{marginTop:14}}><small>Allocation history</small>{allocations.length===0?<p>No allocations yet.</p>:allocations.map(a=><div key={a.id} style={row}><span>{a.receivableId}</span><span>{money(a.amountPaise)} · {new Date(a.allocatedAt).toLocaleString('en-IN')}</span></div>)}</div></div>}</section>

    <section style={panel}><h2 style={{marginTop:0}}>Accounting controls</h2><div style={twoCol}><div><h3>Charge rules</h3>{rules.length===0?<p>No rules.</p>:rules.slice(0,20).map(r=><div key={r.id} style={row}><span><b>{r.code}</b> · {r.name}<br/><small>{r.frequency} · {r.lateFeeMode} · {r.graceDays} day grace</small></span><b>{money(r.amountPaise)}</b></div>)}</div><div><h3>Accounting periods</h3>{periods.length===0?<p>No periods.</p>:periods.slice(0,12).map(p=><div key={p.id} style={row}><span><b>{p.code}</b> · {p.name}</span><b>{p.status}</b></div>)}</div></div><div style={{marginTop:20}}><h3>Recent journals</h3>{journals.length===0?<p>No journals.</p>:journals.slice(0,20).map(j=><div key={j.id} style={row}><span><b>{j.entryNumber}</b> · {j.description}<br/><small>{new Date(j.entryDate).toLocaleDateString('en-IN')} · {j.status}</small></span><span>{money(j.debitPaise)}</span></div>)}</div></section>
  </main>
}

function Metric({label,value}:{label:string;value:string}){return <div style={metric}><small>{label}</small><div style={{fontSize:23,fontWeight:800,marginTop:4}}>{value}</div></div>}
const panel:React.CSSProperties={marginTop:20,padding:20,border:'1px solid #dbe7ea',borderRadius:16,background:'white'}
const metricGrid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12,marginTop:20}
const metric:React.CSSProperties={padding:16,border:'1px solid #dbe7ea',borderRadius:14,background:'white'}
const sectionHeader:React.CSSProperties={display:'flex',justifyContent:'space-between',alignItems:'end',gap:12,flexWrap:'wrap'}
const row:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',padding:'10px 0',borderBottom:'1px solid #eef2f3',flexWrap:'wrap'}
const table:React.CSSProperties={width:'100%',borderCollapse:'collapse',marginTop:12}
const right:React.CSSProperties={textAlign:'right'}
const input:React.CSSProperties={display:'block',width:'100%',boxSizing:'border-box',marginTop:6,padding:10,border:'1px solid #cbd5e1',borderRadius:10,font:'inherit'}
const primary:React.CSSProperties={padding:'10px 14px',borderRadius:10,border:'1px solid #05879A',background:'#05879A',color:'white',fontWeight:700,cursor:'pointer'}
const secondary:React.CSSProperties={padding:'10px 14px',borderRadius:10,border:'1px solid #94a3b8',background:'white',fontWeight:700,cursor:'pointer'}
const linkButton:React.CSSProperties={...secondary,textDecoration:'none',color:'inherit'}
const errorBox:React.CSSProperties={marginTop:18,padding:12,border:'1px solid #ef4444',borderRadius:10,background:'#fff7f7'}
const notice:React.CSSProperties={marginTop:18,padding:12,border:'1px solid #f59e0b',borderRadius:10,background:'#fffbeb'}
const twoCol:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))',gap:24}
