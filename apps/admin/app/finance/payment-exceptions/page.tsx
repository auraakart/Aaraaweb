'use client'

import { FormEvent,useState } from 'react'
import './finance-workflow.css'
import { ActionBar, EmptyState, ErrorState, EvidenceGrid, FormField, PageHeader, PageShell, PrimaryButton, SecondaryButton } from '../../../components/admin-ui'

type Session={accessToken:string;role:string;societyName?:string}
type Snapshot={paymentId:string;status:string;amountPaise:string;grossAllocatedPaise:string;reversedAllocatedPaise:string;netAllocatedPaise:string;refundedPaise:string;refundablePaise:string}
type Allocation={id:string;receivableId:string;amountPaise:string;reversedPaise:string;reversiblePaise:string;allocatedAt:string}
type Reversal={id:string;allocationId:string;receivableId:string;amountPaise:string;reason:string;reversedAt:string}
type Refund={id:string;amountPaise:string;reason:string;providerReference?:string;refundedAt:string}
const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
const manageRoles=new Set(['SUPER_ADMIN','ACCOUNTANT'])
function session():Session|null{try{const r=sessionStorage.getItem('aaraagate.admin.session');return r?JSON.parse(r):null}catch{return null}}
async function api<T>(s:Session,path:string,init:RequestInit={}):Promise<T>{const r=await fetch(`${base}/api/v1${path}`,{...init,headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.accessToken}`,...init.headers}});const t=await r.text(),b=t?JSON.parse(t):null;if(!r.ok)throw new Error(Array.isArray(b?.message)?b.message.join(', '):b?.message??`Request failed (${r.status})`);return b as T}
const money=(v:string|number|undefined)=>`₹${(Number(v??0)/100).toLocaleString('en-IN',{maximumFractionDigits:2})}`

export default function PaymentExceptions(){
 const[paymentId,setPaymentId]=useState(''),[snap,setSnap]=useState<Snapshot|null>(null),[allocs,setAllocs]=useState<Allocation[]>([]),[revs,setRevs]=useState<Reversal[]>([]),[refunds,setRefunds]=useState<Refund[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[success,setSuccess]=useState('')
 const[amount,setAmount]=useState(''),[reason,setReason]=useState(''),[providerRef,setProviderRef]=useState(''),[reversalTarget,setReversalTarget]=useState<Allocation|null>(null),[reversalAmount,setReversalAmount]=useState(''),[reversalReason,setReversalReason]=useState('')
 const s=typeof window==='undefined'?null:session(),canManage=!!s&&manageRoles.has(s.role)

 async function inspect(e?:FormEvent){e?.preventDefault();if(!s||!paymentId.trim())return;setBusy(true);setError('');try{const id=paymentId.trim();const[x,a,r,f]=await Promise.all([api<Snapshot>(s,`/accounting/payment-exceptions/payments/${id}`),api<Allocation[]>(s,`/accounting/settlements/payments/${id}/allocations`),api<Reversal[]>(s,`/accounting/payment-exceptions/payments/${id}/allocation-reversals`),api<Refund[]>(s,`/accounting/payment-exceptions/payments/${id}/refunds`)]);setSnap(x);setAllocs(a);setRevs(r);setRefunds(f)}catch(e){setSnap(null);setAllocs([]);setRevs([]);setRefunds([]);setError(e instanceof Error?e.message:'Could not inspect payment')}finally{setBusy(false)}}
 function reverse(a:Allocation){if(!canManage)return;setReversalTarget(a);setReversalAmount((Number(a.reversiblePaise)/100).toString());setReversalReason('');setError('');setSuccess('')}
 async function submitReverse(e:FormEvent){e.preventDefault();if(!s||!canManage||!reversalTarget)return;const rupees=Number(reversalAmount),max=Number(reversalTarget.reversiblePaise)/100;if(!Number.isFinite(rupees)||rupees<=0||rupees>max)return setError(`Enter a reversal amount up to ${money(reversalTarget.reversiblePaise)}.`);if(!reversalReason.trim())return setError('Enter a reversal reason.');setBusy(true);setError('');setSuccess('');try{await api(s,`/accounting/payment-exceptions/allocations/${reversalTarget.id}/reverse`,{method:'POST',body:JSON.stringify({amountPaise:Math.round(rupees*100),reason:reversalReason.trim(),idempotencyKey:`admin-reversal-${reversalTarget.id}-${Date.now()}`})});setReversalTarget(null);setReversalAmount('');setReversalReason('');setSuccess('Allocation reversal recorded.');await inspect()}catch(e){setError(e instanceof Error?e.message:'Could not reverse allocation')}finally{setBusy(false)}}
 async function refund(e:FormEvent){e.preventDefault();if(!s||!canManage||!snap)return;const rupees=Number(amount);if(!rupees||!reason.trim())return;setBusy(true);setError('');setSuccess('');try{await api(s,`/accounting/payment-exceptions/payments/${snap.paymentId}/refunds`,{method:'POST',body:JSON.stringify({amountPaise:Math.round(rupees*100),reason:reason.trim(),providerReference:providerRef.trim()||undefined,idempotencyKey:`admin-refund-${snap.paymentId}-${Date.now()}`})});setAmount('');setReason('');setProviderRef('');setSuccess('Refund record created.');await inspect()}catch(e){setError(e instanceof Error?e.message:'Could not record refund')}finally{setBusy(false)}}

 if(!s)return <PageShell><PageHeader title="Finance access required" actions={<a href="/">Return to Admin</a>}/></PageShell>
 return <PageShell>
  <PageHeader context={`${s.societyName??'Current society'} · ${s.role.replaceAll('_',' ')}`} title="Payment exceptions" description="Auditable allocation reversals and refund recording. Captured payments are never rewritten." actions={<a href="/finance">← Finance workspace</a>}/>
  {error&&<ErrorState title="Payment exception operation failed" description={error}/>}
  <ActionBar feedback={success} label="Payment exception actions"/>
  <section style={panel}><form onSubmit={inspect} style={inlineForm}><FormField label="Payment ID" value={paymentId} onChange={e=>setPaymentId(e.target.value)} placeholder="UUID"/><SecondaryButton type="submit" loading={busy} disabled={!paymentId.trim()}>Inspect</SecondaryButton></form></section>
  {snap&&<>
   <section style={panel}><h2>Payment snapshot</h2><EvidenceGrid items={[
    {id:'captured',label:'Captured',value:money(snap.amountPaise)},{id:'gross',label:'Gross allocated',value:money(snap.grossAllocatedPaise)},{id:'reversed',label:'Reversed',value:money(snap.reversedAllocatedPaise)},{id:'net',label:'Net allocated',value:money(snap.netAllocatedPaise)},{id:'refunded',label:'Refunded',value:money(snap.refundedPaise)},{id:'refundable',label:'Refundable',value:money(snap.refundablePaise)}
   ]}/></section>
   {canManage&&reversalTarget&&<section style={panel}><div style={sectionHeader}><div><h2>Reverse allocation</h2><small>{money(reversalTarget.amountPaise)} allocated · {money(reversalTarget.reversiblePaise)} reversible</small></div><SecondaryButton type="button" disabled={busy} onClick={()=>setReversalTarget(null)}>Cancel</SecondaryButton></div><form onSubmit={submitReverse} style={formGrid}><FormField label="Amount (₹)" required type="number" min="0.01" step="0.01" max={(Number(reversalTarget.reversiblePaise)/100).toString()} value={reversalAmount} onChange={e=>setReversalAmount(e.target.value)}/><FormField label="Reason" required value={reversalReason} onChange={e=>setReversalReason(e.target.value)}/><PrimaryButton type="submit" loading={busy} disabled={!reversalAmount||!reversalReason.trim()}>Confirm reversal</PrimaryButton></form></section>}
   <section style={panel}><h2>Allocations</h2>{allocs.length===0?<EmptyState title="No allocations"/>:allocs.map(a=><div key={a.id} style={item}><span><b>{money(a.amountPaise)}</b> to {a.receivableId}<br/><small>Reversed {money(a.reversedPaise)} · reversible {money(a.reversiblePaise)}</small></span>{canManage&&Number(a.reversiblePaise)>0&&<PrimaryButton disabled={busy} onClick={()=>void reverse(a)}>Reverse</PrimaryButton>}</div>)}</section>
   {canManage&&<section style={panel}><h2>Record refund</h2><p>Only genuinely refundable cash can be recorded. Reverse allocations first when necessary.</p><form onSubmit={refund} style={formGrid}><FormField label="Amount (₹)" type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/><FormField label="Reason" value={reason} onChange={e=>setReason(e.target.value)}/><FormField label="Provider reference" value={providerRef} onChange={e=>setProviderRef(e.target.value)}/><PrimaryButton type="submit" loading={busy} disabled={!amount||!reason.trim()}>Record refund</PrimaryButton></form></section>}
   <section style={panel}><h2>Audit history</h2><h3>Allocation reversals</h3>{revs.length===0?<EmptyState title="No allocation reversals"/>:revs.map(r=><div key={r.id} style={item}><span>{money(r.amountPaise)} · {r.reason}</span><small>{new Date(r.reversedAt).toLocaleString('en-IN')}</small></div>)}<h3>Refunds</h3>{refunds.length===0?<EmptyState title="No refunds"/>:refunds.map(r=><div key={r.id} style={item}><span>{money(r.amountPaise)} · {r.reason}{r.providerReference?` · ${r.providerReference}`:''}</span><small>{new Date(r.refundedAt).toLocaleString('en-IN')}</small></div>)}</section>
  </>}
 </PageShell>
}
const panel:React.CSSProperties={display:'grid',gap:12,background:'var(--surface,#fff)',border:'1px solid var(--line,#d5e8eb)',borderRadius:16,padding:18,marginTop:18}
const inlineForm:React.CSSProperties={display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:12,alignItems:'end'}
const formGrid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,180px),1fr))',gap:12,alignItems:'end'}
const sectionHeader:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}
const item:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--line,#e5e7eb)',flexWrap:'wrap'}
