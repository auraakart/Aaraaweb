'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActionBar, DangerButton, EmptyState, ErrorState, EvidenceGrid, FormField, PageHeader, PageShell, PrimaryButton, ReadinessPanel, SecondaryButton, SelectField, StatusPill } from '../../components/admin-ui'

type Session={accessToken:string;role:string;societyName?:string}
type Receivable={id:string;unitId:string;receivableNumber:string;billingPeriod:string;description:string;amountPaise:string;outstandingPaise:string;dueDate:string;status:string;issuedAt:string}
type Ageing={currentPaise:string;days1To30Paise:string;days31To60Paise:string;days61To90Paise:string;days90PlusPaise:string}
type Rule={id:string;code:string;name:string;frequency:string;amountPaise:string;lateFeeMode:string;graceDays:number;active:boolean}
type Journal={id:string;entryNumber:string;entryDate:string;description:string;status:string;debitPaise:string;creditPaise:string;postedAt?:string|null}
type Period={id:string;code:string;name:string;startsOn:string;endsOn:string;status:string;closedAt?:string|null;closedByUserId?:string|null}
type CloseReadiness={period:Period;journalSummary:{draftCount:number;postedCount:number;reversedCount:number;debitPaise:string;creditPaise:string;balanced:boolean};blockers:Array<{code:string;count:number;message:string}>;readyToClose:boolean}
type TrialBalanceRow={accountId:string;code:string;name:string;type:string;debitPaise:string;creditPaise:string;netDebitPaise:string}
type IncomeExpenseRow={accountId:string;code:string;name:string;type:'INCOME'|'EXPENSE';debitPaise:string;creditPaise:string;amountPaise:string}
type BalanceSheet={asOf:string;accounts:Array<{accountId:string;code:string;name:string;type:string;amountPaise:string}>;currentResultPaise:string;assetTotalPaise:string;liabilityTotalPaise:string;equityTotalPaise:string;balanceCheckPaise:string}
type FundStatementRow={fundId:string;code:string;name:string;restricted:boolean;openingNetDebitPaise:string;periodDebitPaise:string;periodCreditPaise:string;closingNetDebitPaise:string}
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
  const[selectedPeriodId,setSelectedPeriodId]=useState(''),[closeReadiness,setCloseReadiness]=useState<CloseReadiness|null>(null),[trialBalance,setTrialBalance]=useState<TrialBalanceRow[]>([]),[incomeExpense,setIncomeExpense]=useState<IncomeExpenseRow[]>([]),[balanceSheet,setBalanceSheet]=useState<BalanceSheet|null>(null),[fundStatement,setFundStatement]=useState<FundStatementRow[]>([]),[periodLoading,setPeriodLoading]=useState(false)
  const[latePreview,setLatePreview]=useState<LatePreview>([]),[batches,setBatches]=useState<LateBatch[]>([]),[unapplied,setUnapplied]=useState<Unapplied|null>(null)
  const[asOf,setAsOf]=useState(today()),[paymentId,setPaymentId]=useState(''),[payment,setPayment]=useState<PaymentAvailability|null>(null),[allocations,setAllocations]=useState<Allocation[]>([])
  const[allocationReceivable,setAllocationReceivable]=useState(''),[allocationAmount,setAllocationAmount]=useState('')
  const[closeConfirmed,setCloseConfirmed]=useState(false),[lateFeeConfirmed,setLateFeeConfirmed]=useState(false)
  const periodRequest=useRef(0)
  const canRead=(s:Session|null)=>!!s&&readRoles.has(s.role), canManage=!!session&&manageRoles.has(session.role)

  const load=useCallback(async(s:Session)=>{setLoading(true);setError('');try{const[r,a,cr,j,p,lb,u]=await Promise.all([
    api<Receivable[]>(s,'/accounting/receivables'),api<Ageing>(s,`/accounting/receivables/ageing?asOf=${today()}`),api<Rule[]>(s,'/accounting/receivables/charge-rules'),api<Journal[]>(s,'/accounting/journals'),api<Period[]>(s,'/accounting/periods'),api<LateBatch[]>(s,'/accounting/late-fees/batches'),api<Unapplied>(s,'/accounting/late-fees/unapplied-cash')]);setReceivables(r);setAgeing(a);setRules(cr);setJournals(j);setPeriods(p);setSelectedPeriodId(current=>current&&p.some(period=>period.id===current)?current:(p.find(period=>period.status==='OPEN')??p[0])?.id??'');setBatches(lb);setUnapplied(u)}catch(e){setError(e instanceof Error?e.message:'Could not load finance workspace')}finally{setLoading(false)}},[])
  useEffect(()=>{const s=getSession();setSession(s);if(s&&canRead(s))void load(s);else setLoading(false)},[load])

  const loadPeriodWorkspace=useCallback(async(s:Session,period:Period)=>{
    const requestId=++periodRequest.current
    setPeriodLoading(true);setError('');setCloseReadiness(null);setTrialBalance([]);setIncomeExpense([]);setBalanceSheet(null);setFundStatement([]);setCloseConfirmed(false)
    try{
      const from=period.startsOn.slice(0,10),to=period.endsOn.slice(0,10)
      const[ready,tb,ie,bs,fs]=await Promise.all([
        api<CloseReadiness>(s,`/accounting/periods/${period.id}/close-readiness`),
        api<TrialBalanceRow[]>(s,`/accounting/reports/trial-balance?asOf=${to}`),
        api<IncomeExpenseRow[]>(s,`/accounting/reports/income-expense?from=${from}&to=${to}`),
        api<BalanceSheet>(s,`/accounting/reports/balance-sheet?asOf=${to}`),
        api<FundStatementRow[]>(s,`/accounting/reports/fund-statement?from=${from}&to=${to}`),
      ])
      if(requestId!==periodRequest.current)return
      setCloseReadiness(ready);setTrialBalance(tb);setIncomeExpense(ie);setBalanceSheet(bs);setFundStatement(fs)
    }catch(e){
      if(requestId===periodRequest.current)setError(e instanceof Error?e.message:'Could not load period close workspace')
    }finally{
      if(requestId===periodRequest.current)setPeriodLoading(false)
    }
  },[])

  useEffect(()=>{if(!session||!selectedPeriodId)return;const period=periods.find(p=>p.id===selectedPeriodId);if(period)void loadPeriodWorkspace(session,period)},[session,selectedPeriodId,periods,loadPeriodWorkspace])

  async function closeSelectedPeriod(){if(!session||!canManage||!closeReadiness?.readyToClose||closeReadiness.period.status!=='OPEN'||!closeConfirmed)return;const period=closeReadiness.period;setBusy(true);setError('');try{await api(session,`/accounting/periods/${period.id}/close`,{method:'POST'});setCloseConfirmed(false);await load(session);await loadPeriodWorkspace(session,{...period,status:'CLOSED'})}catch(e){setError(e instanceof Error?e.message:'Could not close accounting period')}finally{setBusy(false)}}

  const overdue=useMemo(()=>receivables.filter(r=>Number(r.outstandingPaise)>0&&r.dueDate.slice(0,10)<today()),[receivables])
  const totalOutstanding=useMemo(()=>receivables.reduce((n,r)=>n+Math.max(0,Number(r.outstandingPaise)),0),[receivables])
  const settled=receivables.filter(r=>r.status==='SETTLED').length

  async function previewLateFees(){if(!session)return;setBusy(true);setError('');try{setLatePreview(await api<LatePreview>(session,`/accounting/late-fees/preview?asOf=${asOf}`))}catch(e){setError(e instanceof Error?e.message:'Could not preview late fees')}finally{setBusy(false)}}
  async function applyLateFees(){if(!session||!canManage||!lateFeeConfirmed||latePreview.length===0)return;setBusy(true);setError('');try{await api(session,'/accounting/late-fees/apply',{method:'POST',body:JSON.stringify({asOfDate:asOf,entryDate:today(),idempotencyKey:`late-fee-${asOf}`,journalPrefix:`LF-${asOf.replaceAll('-','')}`})});setLatePreview([]);setLateFeeConfirmed(false);await load(session)}catch(e){setError(e instanceof Error?e.message:'Could not apply late fees')}finally{setBusy(false)}}
  async function inspectPayment(e:FormEvent){e.preventDefault();if(!session||!paymentId.trim())return;setBusy(true);setError('');try{const[p,a]=await Promise.all([api<PaymentAvailability>(session,`/accounting/settlements/payments/${paymentId.trim()}/availability`),api<Allocation[]>(session,`/accounting/settlements/payments/${paymentId.trim()}/allocations`)]);setPayment(p);setAllocations(a)}catch(e){setPayment(null);setAllocations([]);setError(e instanceof Error?e.message:'Could not inspect payment')}finally{setBusy(false)}}
  async function allocate(e:FormEvent){e.preventDefault();if(!session||!canManage||!payment||!allocationReceivable)return;const rupees=Number(allocationAmount);if(!Number.isFinite(rupees)||rupees<=0){setError('Enter a positive allocation amount.');return}setBusy(true);setError('');try{await api(session,`/accounting/settlements/receivables/${allocationReceivable}/allocate`,{method:'POST',body:JSON.stringify({paymentId:payment.paymentId,amountPaise:Math.round(rupees*100),idempotencyKey:`admin-${payment.paymentId}-${allocationReceivable}-${Math.round(rupees*100)}`})});setAllocationAmount('');await inspectPayment({preventDefault(){}} as FormEvent);await load(session)}catch(e){setError(e instanceof Error?e.message:'Could not allocate payment')}finally{setBusy(false)}}

  if(loading)return <PageShell><PageHeader title="Finance workspace" description="Loading finance controls…"/></PageShell>
  if(!canRead(session))return <PageShell><PageHeader title="Finance access required" description="Accountant/Treasurer, Committee, Society Admin or platform finance access is required." actions={<a href="/">Return to Admin</a>}/></PageShell>
  return <PageShell>
    <PageHeader context={`${session?.societyName??'Current society'} · ${session?.role.replaceAll('_',' ')}`} title="Finance workspace" description="Receivables, ageing, settlements, late fees and accounting controls." actions={<a href="/">← Admin console</a>}/>
    {error&&<ErrorState title="Finance operation failed" description={error}/>}
    <ActionBar label="Finance workspace actions"><SecondaryButton loading={loading} disabled={busy} onClick={()=>session&&void load(session)}>Refresh</SecondaryButton></ActionBar>
    {!canManage&&<div style={notice}>Read-only finance access. Posting, allocation and late-fee actions are restricted to Accountant/Treasurer or platform finance roles.</div>}

    <section style={panel}><h2>Receivables summary</h2><EvidenceGrid items={[
      {id:'outstanding',label:'Outstanding',value:money(totalOutstanding)},
      {id:'open-receivables',label:'Open receivables',value:String(receivables.filter(r=>Number(r.outstandingPaise)>0).length)},
      {id:'overdue',label:'Overdue',value:String(overdue.length)},
      {id:'settled',label:'Settled',value:String(settled)},
      {id:'unapplied-cash',label:'Unapplied cash',value:money(unapplied?.totalUnappliedPaise)},
    ]}/></section>

    <section style={panel}><h2>Ageing</h2>{ageing?<EvidenceGrid items={[
  {id:'current',label:'Current',value:money(ageing.currentPaise)},{id:'1-30',label:'1–30 days',value:money(ageing.days1To30Paise)},{id:'31-60',label:'31–60 days',value:money(ageing.days31To60Paise)},{id:'61-90',label:'61–90 days',value:money(ageing.days61To90Paise)},{id:'90-plus',label:'90+ days',value:money(ageing.days90PlusPaise)}
]}/>:<EmptyState title="No ageing data"/>}</section>

    <section style={panel}><div style={sectionHeader}><div><h2 style={{margin:'0 0 4px'}}>Receivables</h2><small>{receivables.length} recent records</small></div></div>{receivables.length===0?<p>No receivables issued yet.</p>:<div style={{overflowX:'auto'}}><table style={table}><thead><tr><th>Number</th><th>Period</th><th>Due</th><th>Status</th><th style={right}>Charge</th><th style={right}>Outstanding</th></tr></thead><tbody>{receivables.slice(0,100).map(r=><tr key={r.id}><td><b>{r.receivableNumber}</b><div><small>{r.description}</small></div></td><td>{r.billingPeriod}</td><td>{new Date(r.dueDate).toLocaleDateString('en-IN')}</td><td>{r.status.replaceAll('_',' ')}</td><td style={right}>{money(r.amountPaise)}</td><td style={right}><b>{money(r.outstandingPaise)}</b></td></tr>)}</tbody></table></div>}</section>

    <section style={panel}><div style={sectionHeader}><div><h2 style={{margin:'0 0 4px'}}>Late-fee control</h2><small>Preview first; posting is explicit and auditable.</small></div><ActionBar label="Late-fee actions"><FormField label="As of" type="date" value={asOf} onChange={e=>{setAsOf(e.target.value);setLateFeeConfirmed(false)}}/><SecondaryButton disabled={busy} onClick={()=>void previewLateFees()}>Preview</SecondaryButton>{canManage&&<DangerButton disabled={busy||latePreview.length===0||!lateFeeConfirmed} onClick={()=>void applyLateFees()}>Apply batch</DangerButton>}</ActionBar></div>{latePreview.length>0&&<div style={{marginTop:14}}>{canManage&&<label style={confirmRow}><input type="checkbox" checked={lateFeeConfirmed} onChange={e=>setLateFeeConfirmed(e.target.checked)}/><span>I confirm this late-fee batch will post accounting journals for the previewed receivables.</span></label>}<b>{latePreview.length} eligible receivable{latePreview.length===1?'':'s'}</b><div style={{display:'grid',gap:8,marginTop:8}}>{latePreview.slice(0,30).map(x=><div key={x.receivableId} style={row}><span>{x.receivableNumber} · due {new Date(x.dueDate).toLocaleDateString('en-IN')}</span><span>{money(x.outstandingPaise)} → <b>{money(x.feePaise)} fee</b></span></div>)}</div></div>}<div style={{marginTop:18}}><small>Recent batches</small>{batches.length===0?<p>No late-fee batches yet.</p>:batches.slice(0,10).map(b=><div key={b.id} style={row}><span>{new Date(b.asOfDate).toLocaleDateString('en-IN')} · {b.status}</span><span>{b.assessmentCount??0} assessments · {money(b.totalFeePaise)}</span></div>)}</div></section>

    <section style={panel}><h2 style={{marginTop:0}}>Payment allocation</h2><p>Inspect a captured payment and allocate only its available amount to an open receivable.</p><form onSubmit={inspectPayment} style={inlineForm}><FormField label="Payment ID" value={paymentId} onChange={e=>setPaymentId(e.target.value)} placeholder="UUID"/><SecondaryButton type="submit" disabled={busy||!paymentId.trim()}>Inspect payment</SecondaryButton></form>{payment&&<div style={{marginTop:16}}><div style={metricGrid}><Metric label="Payment amount" value={money(payment.amountPaise)}/><Metric label="Allocated" value={money(payment.allocatedPaise)}/><Metric label="Available" value={money(payment.unallocatedPaise)}/></div>{canManage&&<form onSubmit={allocate} style={allocationForm}><SelectField label="Receivable" value={allocationReceivable} onChange={e=>setAllocationReceivable(e.target.value)}><option value="">Choose open receivable</option>{receivables.filter(r=>Number(r.outstandingPaise)>0).map(r=><option key={r.id} value={r.id}>{r.receivableNumber} · {money(r.outstandingPaise)}</option>)}</SelectField><FormField label="Amount (₹)" type="number" min="0.01" step="0.01" value={allocationAmount} onChange={e=>setAllocationAmount(e.target.value)}/><PrimaryButton type="submit" disabled={busy||!allocationReceivable||!allocationAmount}>Allocate</PrimaryButton></form>}<div style={{marginTop:14}}><small>Allocation history</small>{allocations.length===0?<p>No allocations yet.</p>:allocations.map(a=><div key={a.id} style={row}><span>{a.receivableId}</span><span>{money(a.amountPaise)} · {new Date(a.allocatedAt).toLocaleString('en-IN')}</span></div>)}</div></div>}</section>

    <section style={panel}><div style={sectionHeader}><div><h2 style={{margin:'0 0 4px'}}>Period close & financial reports</h2><small>Read-only statements reuse the accounting reporting engine. Closing is explicit, permissioned and irreversible.</small></div>{periods.length>0&&<div style={{minWidth:280}}><SelectField label="Accounting period" value={selectedPeriodId} onChange={e=>setSelectedPeriodId(e.target.value)}>{periods.map(p=><option key={p.id} value={p.id}>{p.code} · {p.name} · {p.status}</option>)}</SelectField></div>}</div>
      <ReadinessPanel
        title="Period close readiness"
        state={periodLoading?'loading':closeReadiness?'ready':'error'}
        status={closeReadiness?{label:closeReadiness.readyToClose?'READY TO CLOSE':'BLOCKED',tone:closeReadiness.readyToClose?'success':'warning'}:undefined}
        blockers={closeReadiness?.blockers.map(b=>`${b.count} blocker${b.count===1?'':'s'}: ${b.message}`)??[]}
        boundary={closeReadiness?'Closing is explicit, permissioned and irreversible. Closed periods cannot be reopened or materially edited.':undefined}
        checks={closeReadiness?<><EvidenceGrid items={[
          {id:'draft-journals',label:'Draft journals',value:String(closeReadiness.journalSummary.draftCount)},
          {id:'posted-journals',label:'Posted journals',value:String(closeReadiness.journalSummary.postedCount)},
          {id:'reversed-journals',label:'Reversed journals',value:String(closeReadiness.journalSummary.reversedCount)},
          {id:'posted-debit',label:'Posted debit',value:money(closeReadiness.journalSummary.debitPaise)},
          {id:'posted-credit',label:'Posted credit',value:money(closeReadiness.journalSummary.creditPaise)},
          {id:'ledger-balance',label:'Ledger balance',value:closeReadiness.journalSummary.balanced?'Balanced':'Mismatch'},
        ]}/>
        <div style={row}><span><b>{closeReadiness.period.code} · {closeReadiness.period.name}</b><br/><small>{new Date(closeReadiness.period.startsOn).toLocaleDateString('en-IN')} – {new Date(closeReadiness.period.endsOn).toLocaleDateString('en-IN')} · {closeReadiness.period.status}</small></span>{closeReadiness.period.status==='CLOSED'?<StatusPill label={`Closed ${closeReadiness.period.closedAt?new Date(closeReadiness.period.closedAt).toLocaleString('en-IN'):''}`} tone="neutral"/>:canManage?<div style={closeControls}><label style={confirmRow}><input type="checkbox" checked={closeConfirmed} disabled={!closeReadiness.readyToClose} onChange={e=>setCloseConfirmed(e.target.checked)}/><span>I confirm this period close is irreversible and future accounting entries must use an open period.</span></label><DangerButton disabled={busy||!closeReadiness.readyToClose||!closeConfirmed} onClick={()=>void closeSelectedPeriod()}>Close period</DangerButton></div>:<StatusPill label="READ ONLY" tone="neutral"/>}</div></>:undefined}
      />
      <div style={{marginTop:24}}><h3>Period statements</h3><div style={metricGrid}><Metric label="Trial-balance debit" value={money(trialBalance.reduce((n,r)=>n+Number(r.debitPaise),0))}/><Metric label="Trial-balance credit" value={money(trialBalance.reduce((n,r)=>n+Number(r.creditPaise),0))}/><Metric label="Income" value={money(incomeExpense.filter(r=>r.type==='INCOME').reduce((n,r)=>n+Number(r.amountPaise),0))}/><Metric label="Expense" value={money(incomeExpense.filter(r=>r.type==='EXPENSE').reduce((n,r)=>n+Number(r.amountPaise),0))}/><Metric label="Assets" value={money(balanceSheet?.assetTotalPaise)}/><Metric label="Balance-sheet check" value={money(balanceSheet?.balanceCheckPaise)}/></div>
      <div style={twoCol}><div><h4>Trial balance</h4>{trialBalance.length===0?<p>No posted balances for this period end.</p>:trialBalance.filter(r=>Number(r.debitPaise)!==0||Number(r.creditPaise)!==0).slice(0,30).map(r=><div key={r.accountId} style={row}><span><b>{r.code}</b> · {r.name}<br/><small>{r.type}</small></span><span>{money(r.debitPaise)} Dr · {money(r.creditPaise)} Cr</span></div>)}</div><div><h4>Fund statement</h4>{fundStatement.length===0?<p>No fund activity for this period.</p>:fundStatement.slice(0,30).map(r=><div key={r.fundId} style={row}><span><b>{r.code}</b> · {r.name}<br/><small>{r.restricted?'Restricted':'General'}</small></span><span>Closing {money(r.closingNetDebitPaise)}</span></div>)}</div></div></div>
    </section>

    <section style={panel}><h2 style={{marginTop:0}}>Accounting controls</h2><div style={twoCol}><div><h3>Charge rules</h3>{rules.length===0?<p>No rules.</p>:rules.slice(0,20).map(r=><div key={r.id} style={row}><span><b>{r.code}</b> · {r.name}<br/><small>{r.frequency} · {r.lateFeeMode} · {r.graceDays} day grace</small></span><b>{money(r.amountPaise)}</b></div>)}</div><div><h3>Accounting periods</h3>{periods.length===0?<p>No periods.</p>:periods.slice(0,12).map(p=><div key={p.id} style={row}><span><b>{p.code}</b> · {p.name}</span><b>{p.status}</b></div>)}</div></div><div style={{marginTop:20}}><h3>Recent journals</h3>{journals.length===0?<p>No journals.</p>:journals.slice(0,20).map(j=><div key={j.id} style={row}><span><b>{j.entryNumber}</b> · {j.description}<br/><small>{new Date(j.entryDate).toLocaleDateString('en-IN')} · {j.status}</small></span><span>{money(j.debitPaise)}</span></div>)}</div></section>
  </PageShell>
}

function Metric({label,value}:{label:string;value:string}){return <div style={metric}><small>{label}</small><div style={{fontSize:23,fontWeight:800,marginTop:4}}>{value}</div></div>}
const panel:React.CSSProperties={marginTop:20,padding:20,border:'1px solid #dbe7ea',borderRadius:16,background:'white'}
const metricGrid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12,marginTop:20}
const metric:React.CSSProperties={padding:16,border:'1px solid #dbe7ea',borderRadius:14,background:'white'}
const sectionHeader:React.CSSProperties={display:'flex',justifyContent:'space-between',alignItems:'end',gap:12,flexWrap:'wrap'}
const row:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',padding:'10px 0',borderBottom:'1px solid #eef2f3',flexWrap:'wrap'}
const table:React.CSSProperties={width:'100%',borderCollapse:'collapse',marginTop:12}
const right:React.CSSProperties={textAlign:'right'}
const notice:React.CSSProperties={marginTop:18,padding:12,border:'1px solid #f59e0b',borderRadius:10,background:'#fffbeb'}
const twoCol:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))',gap:24}

const inlineForm:React.CSSProperties={display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:10,alignItems:'end'}
const allocationForm:React.CSSProperties={display:'grid',gridTemplateColumns:'minmax(0,2fr) minmax(180px,1fr) auto',gap:10,alignItems:'end',marginTop:14}
const confirmRow:React.CSSProperties={display:'grid',gridTemplateColumns:'auto 1fr',gap:10,alignItems:'start'}
const closeControls:React.CSSProperties={display:'grid',gap:10,maxWidth:520}
