'use client'

import { FormEvent,useEffect,useRef,useState } from 'react'
import './finance-workflow.css'
import { ActionBar, DetailPanel, EmptyState, ErrorState, EvidenceGrid, FormField, PageHeader, PageShell, PrimaryButton, QueuePanel, SecondaryButton, StatusPill } from '../../../components/admin-ui'
import { api, type Session } from '../../../lib/admin-client'

type Case={id:string;paymentId:string;status:string;provider:string;providerPaymentId?:string|null;observedProviderStatus?:string|null;observedAmountPaise?:string|null;expectedCapturedPaise:string;expectedRefundedPaise:string;reason?:string|null;lastCheckedAt?:string|null;resolvedAt?:string|null;priority:'HIGH'|'MEDIUM'|'LOW';nextAction:string}
type Operation={id:string;paymentId:string;operationType:string;status:string;provider:string;providerOperationId?:string|null;amountPaise?:string|null;idempotencyKey:string;failureCode?:string|null;failureMessage?:string|null;requestedAt:string;settledAt?:string|null}
const manageRoles=new Set(['SUPER_ADMIN','ACCOUNTANT'])
function session():Session|null{try{const r=sessionStorage.getItem('aaraagate.admin.session');return r?JSON.parse(r):null}catch{return null}}
const money=(v:string|number|undefined|null)=>`₹${(Number(v??0)/100).toLocaleString('en-IN',{maximumFractionDigits:2})}`

export default function ReconciliationPage(){
 const[s,setS]=useState<Session|null>(null),[cases,setCases]=useState<Case[]>([]),[selected,setSelected]=useState<Case|null>(null),[ops,setOps]=useState<Operation[]>([])
 const[paymentId,setPaymentId]=useState(''),[provider,setProvider]=useState('RAZORPAY'),[status,setStatus]=useState(''),[amount,setAmount]=useState(''),[providerPaymentId,setProviderPaymentId]=useState('')
 const[error,setError]=useState(''),[busy,setBusy]=useState(false),[success,setSuccess]=useState(''),[resolutionReason,setResolutionReason]=useState(''),[refundAmount,setRefundAmount]=useState('')
 const operationRequest=useRef(0)
 const canManage=!!s&&manageRoles.has(s.role)
 const unresolvedCases=cases.filter(c=>c.status!=='RESOLVED')
 const highPriorityCases=unresolvedCases.filter(c=>c.priority==='HIGH').length

 async function load(x:Session){setError('');try{const rows=await api<Case[]>('/accounting/payment-reconciliation/cases',{},x);setCases(rows);if(selected)setSelected(rows.find(row=>row.id===selected.id)??selected)}catch(e){setError(e instanceof Error?e.message:'Could not load reconciliation cases')}}
 useEffect(()=>{const x=session();setS(x);if(x)void load(x)},[])

 async function selectCase(c:Case){
  if(!s)return
  const requestId=++operationRequest.current
  setSelected(c);setOps([]);setBusy(true);setError('');setResolutionReason('');setRefundAmount('')
  try{const next=await api<Operation[]>(`/accounting/payment-reconciliation/payments/${c.paymentId}/operations`,{},s);if(requestId===operationRequest.current)setOps(next)}
  catch(e){if(requestId===operationRequest.current)setError(e instanceof Error?e.message:'Could not load gateway operations')}
  finally{if(requestId===operationRequest.current)setBusy(false)}
 }
 async function openCase(e:FormEvent){e.preventDefault();if(!s||!canManage||!paymentId.trim()||!provider.trim())return;setBusy(true);setError('');setSuccess('');try{const c=await api<Case>(`/accounting/payment-reconciliation/payments/${paymentId.trim()}/cases`,{method:'POST',body:JSON.stringify({provider:provider.trim()})},s);await load(s);await selectCase(c);setPaymentId('');setSuccess('Reconciliation case opened/refreshed.')}catch(e){setError(e instanceof Error?e.message:'Could not open reconciliation case')}finally{setBusy(false)}}
 async function observe(){if(!s||!canManage||!selected||!status.trim())return;const p=Number(amount);if(!Number.isFinite(p)||p<0)return setError('Enter a valid observed amount.');setBusy(true);setError('');setSuccess('');try{const c=await api<Case>(`/accounting/payment-reconciliation/cases/${selected.id}/observe`,{method:'POST',body:JSON.stringify({providerPaymentId:providerPaymentId.trim()||undefined,observedProviderStatus:status.trim(),observedAmountPaise:Math.round(p*100)})},s);setSelected(c);setSuccess('Provider observation recorded.');await load(s)}catch(e){setError(e instanceof Error?e.message:'Could not record provider observation')}finally{setBusy(false)}}
 async function resolve(){if(!s||!canManage||!selected)return;const reason=resolutionReason.trim();if(!reason)return setError('Enter a resolution reason before resolving the case.');setBusy(true);setError('');setSuccess('');try{const c=await api<Case>(`/accounting/payment-reconciliation/cases/${selected.id}/resolve`,{method:'POST',body:JSON.stringify({reason})},s);setSelected(c);setResolutionReason('');setSuccess('Reconciliation case resolved.');await load(s)}catch(e){setError(e instanceof Error?e.message:'Could not resolve case')}finally{setBusy(false)}}
 async function requestOp(type:'STATUS_QUERY'|'REFUND'){if(!s||!canManage||!selected)return;let amountPaise:number|undefined;if(type==='REFUND'){const r=Number(refundAmount);if(!Number.isFinite(r)||r<=0)return setError('Enter a positive refund amount.');amountPaise=Math.round(r*100)}setBusy(true);setError('');setSuccess('');try{await api(`/accounting/payment-reconciliation/payments/${selected.paymentId}/operations`,{method:'POST',body:JSON.stringify({operationType:type,provider:selected.provider,amountPaise,idempotencyKey:`admin-${type.toLowerCase()}-${selected.paymentId}-${Date.now()}`})},s);if(type==='REFUND')setRefundAmount('');setOps(await api<Operation[]>(`/accounting/payment-reconciliation/payments/${selected.paymentId}/operations`,{},s));setSuccess(type==='REFUND'?'Refund operation requested.':'Status query requested.')}catch(e){setError(e instanceof Error?e.message:'Could not create gateway operation')}finally{setBusy(false)}}

 if(!s)return <PageShell><PageHeader title="Finance access required" actions={<a href="/">Return to Admin</a>}/></PageShell>
 return <PageShell>
  <PageHeader context={`${s.societyName??'Current society'} · ${s.role.replaceAll('_',' ')}`} title="Payment reconciliation" description="Compare provider evidence with Aaraagate financial truth without rewriting posted accounting history." actions={<a href="/finance">← Finance workspace</a>}/>
  {error&&<ErrorState title="Payment reconciliation operation failed" description={error}/>}
  <ActionBar feedback={success} label="Payment reconciliation actions"><SecondaryButton disabled={busy} onClick={()=>void load(s)}>Refresh cases</SecondaryButton></ActionBar>
  {canManage&&<section style={panel}><h2>Open / refresh case</h2><form onSubmit={openCase} style={formGrid}><FormField label="Payment ID" value={paymentId} onChange={e=>setPaymentId(e.target.value)} placeholder="UUID"/><FormField label="Provider" value={provider} onChange={e=>setProvider(e.target.value)}/><PrimaryButton type="submit" loading={busy} disabled={!paymentId.trim()}>Open case</PrimaryButton></form></section>}

  <PageShell.Columns>
   <QueuePanel title={`Reconciliation cases · ${highPriorityCases} high priority`} count={unresolvedCases.length} state={cases.length?'ready':'empty'} empty={<EmptyState title="No reconciliation cases"/>}>
    <div style={queueList}>{cases.map(c=><button key={c.id} type="button" aria-pressed={selected?.id===c.id} onClick={()=>void selectCase(c)} style={{...caseButton,...(selected?.id===c.id?selectedCase:{})}}><span><strong>{c.paymentId}</strong><br/><small>{c.provider} · {c.priority} priority{c.reason?` · ${c.reason}`:''}</small><br/><small><b>Next:</b> {c.nextAction}</small></span><StatusPill label={c.status} tone={c.status==='RESOLVED'?'success':c.priority==='HIGH'?'danger':'warning'}/></button>)}</div>
   </QueuePanel>
   <DetailPanel title={selected?'Reconciliation evidence':'Selected reconciliation case'} state={selected?'ready':'empty'} empty={<EmptyState title="Select a reconciliation case" description="Choose a case to inspect provider evidence and gateway operations."/>} actions={selected?<StatusPill label={selected.status} tone={selected.status==='RESOLVED'?'success':'warning'}/>:undefined}>
    {selected&&<>
     <div style={guidance}><strong>Recommended next step</strong><p>{selected.nextAction}</p><small>Provider state is evidence only; Aaraagate accounting history remains authoritative until an approved reconciliation action completes.</small></div>
     <EvidenceGrid items={[
      {id:'provider',label:'Provider',value:selected.provider},{id:'expected-captured',label:'Expected captured',value:money(selected.expectedCapturedPaise)},{id:'expected-refunded',label:'Expected refunded',value:money(selected.expectedRefundedPaise)},{id:'observed-status',label:'Observed status',value:selected.observedProviderStatus??'—'},{id:'observed-amount',label:'Observed amount',value:selected.observedAmountPaise?money(selected.observedAmountPaise):'—'},{id:'priority',label:'Queue priority',value:selected.priority},{id:'next-action',label:'Next action',value:selected.nextAction}
     ]}/>
     {canManage&&selected.status!=='RESOLVED'&&<section style={subpanel}><h3>Provider observation</h3><div style={formGrid}><FormField label="Provider payment ID" value={providerPaymentId} onChange={e=>setProviderPaymentId(e.target.value)}/><FormField label="Observed status" value={status} onChange={e=>setStatus(e.target.value)} placeholder="captured/refunded/failed"/><FormField label="Observed amount (₹)" type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/><PrimaryButton disabled={busy||!status.trim()} onClick={()=>void observe()}>Record observation</PrimaryButton></div><div style={formGrid}><SecondaryButton disabled={busy} onClick={()=>void requestOp('STATUS_QUERY')}>Request status query</SecondaryButton><FormField label="Refund amount (₹)" type="number" min="0.01" step="0.01" value={refundAmount} onChange={e=>setRefundAmount(e.target.value)}/><SecondaryButton disabled={busy||!refundAmount} onClick={()=>void requestOp('REFUND')}>Request refund</SecondaryButton></div><div style={formGrid}><FormField label="Resolution reason" value={resolutionReason} onChange={e=>setResolutionReason(e.target.value)} placeholder="Describe the evidence and resolution"/><PrimaryButton disabled={busy||!resolutionReason.trim()} onClick={()=>void resolve()}>Resolve case</PrimaryButton></div></section>}
     <section><h3>Gateway operations</h3>{ops.length===0?<EmptyState title="No gateway operations"/>:ops.map(o=><div key={o.id} style={item}><span><b>{o.operationType}</b> · {o.status}<br/><small>{o.providerOperationId??o.id}{o.failureCode?` · ${o.failureCode}`:''}{o.failureMessage?` · ${o.failureMessage}`:''}</small></span><span>{o.amountPaise?money(o.amountPaise):'—'}<br/><small>{new Date(o.requestedAt).toLocaleString('en-IN')}</small></span></div>)}</section>
    </>}
   </DetailPanel>
  </PageShell.Columns>
 </PageShell>
}
const panel:React.CSSProperties={display:'grid',gap:12,background:'var(--surface,#fff)',border:'1px solid var(--line,#d5e8eb)',borderRadius:16,padding:18}
const subpanel:React.CSSProperties={display:'grid',gap:12,padding:14,border:'1px solid var(--line,#d5e8eb)',borderRadius:12,background:'var(--neutral-soft,#f8fafc)'}
const formGrid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,200px),1fr))',gap:12,alignItems:'end'}
const queueList:React.CSSProperties={display:'grid',gap:8}
const caseButton:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',width:'100%',padding:12,border:'1px solid var(--line,#d5e8eb)',borderRadius:12,background:'var(--surface,#fff)',color:'var(--ink,#17323a)',textAlign:'left',font:'inherit',cursor:'pointer'}
const selectedCase:React.CSSProperties={background:'var(--neutral-soft,#eef6f7)',borderColor:'var(--brand,#05879a)',boxShadow:'inset 3px 0 0 var(--brand,#05879a)'}
const item:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--line,#e5e7eb)',flexWrap:'wrap'}

const guidance:React.CSSProperties={padding:14,border:'1px solid var(--line,#d5e8eb)',borderRadius:12,background:'var(--neutral-soft,#f8fafc)',marginBottom:12}
