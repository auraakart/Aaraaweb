'use client'

import {FormEvent,useCallback,useEffect,useMemo,useState} from 'react'
import { ActionBar, EmptyState, ErrorState, EvidenceGrid, FormField, PageHeader, PageShell, PrimaryButton, SecondaryButton, SelectField } from '../../../components/admin-ui'
import { api, type Session } from '../../../lib/admin-client'

type FinancePo={id:string;requestId:string;poNumber:string;amountPaise:string;status:string;issuedAt:string;requestNumber:string;requestTitle:string;vendorCode:string;vendorName:string;expenseId?:string|null;expenseNumber?:string|null;expenseStatus?:string|null;linkedAt?:string|null}
type Account={id:string;code:string;name:string;type:string;active:boolean}
type Fund={id:string;code:string;name:string;netPaise:string}

const readRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','ACCOUNTANT','AUDITOR'])
const manageRoles=new Set(['SUPER_ADMIN','ACCOUNTANT'])
function session():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw) as Session:null}catch{return null}}
const money=(v:string|number)=>`₹${(Number(v)/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`

export default function ProcurementFinancePage(){
 const s=typeof window==='undefined'?null:session(),allowed=!!s&&readRoles.has(s.role),canManage=!!s&&manageRoles.has(s.role)
 const[pos,setPos]=useState<FinancePo[]>([]),[accounts,setAccounts]=useState<Account[]>([]),[funds,setFunds]=useState<Fund[]>([])
 const[selectedId,setSelectedId]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[success,setSuccess]=useState('')
 const[expenseNumber,setExpenseNumber]=useState(''),[expenseDate,setExpenseDate]=useState(new Date().toISOString().slice(0,10)),[dueDate,setDueDate]=useState(''),[invoiceReference,setInvoiceReference]=useState(''),[description,setDescription]=useState(''),[expenseAccountId,setExpenseAccountId]=useState(''),[fundId,setFundId]=useState('')
 const selected=useMemo(()=>pos.find(p=>p.id===selectedId)??null,[pos,selectedId])
 const expenseAccounts=useMemo(()=>accounts.filter(a=>a.active&&a.type==='EXPENSE'),[accounts])
 const load=useCallback(async()=>{if(!s||!allowed)return;setLoading(true);setError('');try{const[p,a,f]=await Promise.all([api<FinancePo[]>('/vendors/procurement/accounting/purchase-orders',{},s),api<Account[]>('/accounting/accounts',{},s),api<Fund[]>('/accounting/finance-operations/fund-utilization',{},s)]);setPos(p);setAccounts(a);setFunds(f);setSelectedId(current=>current&&p.some(x=>x.id===current)?current:(p.find(x=>!x.expenseId)?.id??p[0]?.id??''))}catch(e){setError(e instanceof Error?e.message:'Procurement finance handoff could not be loaded')}finally{setLoading(false)}},[s?.accessToken,allowed])
 useEffect(()=>{void load()},[load])
 useEffect(()=>{if(selected){setInvoiceReference(selected.poNumber);setDescription(`Purchase order ${selected.poNumber} · ${selected.vendorName}`) }},[selectedId])
 const createExpense=(e:FormEvent)=>{e.preventDefault();if(!s||!canManage||!selected||selected.expenseId)return;setBusy(true);setError('');setSuccess('');void api(`/vendors/procurement/accounting/purchase-orders/${selected.id}/expense-draft`,{method:'POST',body:JSON.stringify({expenseNumber:expenseNumber.trim(),expenseDate,dueDate:dueDate||undefined,description:description.trim()||undefined,expenseAccountId,fundId:fundId||undefined,invoiceReference:invoiceReference.trim()||undefined})},s).then(()=>{setSuccess('Accounting expense draft created from purchase order.');setExpenseNumber('');setDueDate('');setFundId('');return load()}).catch(e=>setError(e instanceof Error?e.message:'Expense draft could not be created')).finally(()=>setBusy(false))}
 if(!s||!allowed)return <PageShell><PageHeader title="Finance access required" actions={<a href="/">Return</a>}/></PageShell>
 return <PageShell><PageHeader context={`${s.societyName??'Current society'} · ${s.role.replaceAll('_',' ')}`} title="Procurement accounting handoff" description="Review issued purchase orders and create the existing accounting expense draft without granting vendor-management access to finance roles." actions={<a href="/finance/operations">Finance operations →</a>}/>
 {error&&<ErrorState title="Procurement accounting handoff failed" description={error}/>}<ActionBar feedback={success} label="Procurement finance actions"><SecondaryButton disabled={busy} onClick={()=>void load()}>Refresh</SecondaryButton></ActionBar>
 <section style={panel}><h2>Handoff summary</h2><EvidenceGrid items={[{id:'issued',label:'Issued POs',value:pos.length},{id:'awaiting',label:'Awaiting accounting',value:pos.filter(p=>!p.expenseId).length},{id:'linked',label:'Linked',value:pos.filter(p=>!!p.expenseId).length}]}/></section>
 <section style={panel}><h2>Purchase orders</h2>{loading?<p>Loading…</p>:pos.length===0?<EmptyState title="No issued purchase orders"/>:<div style={list}>{pos.map(p=><article key={p.id} style={{...row,background:p.id===selectedId?'#f0fbfd':'white'}}><div style={stack}><b>{p.poNumber} · {p.vendorName}</b><span>{p.requestNumber} · {p.requestTitle}</span><small>{money(p.amountPaise)} · issued {new Date(p.issuedAt).toLocaleString('en-IN')}</small><small>{p.expenseId?`Linked to ${p.expenseNumber} · ${p.expenseStatus}`:'Awaiting accounting expense draft'}</small></div><SecondaryButton aria-pressed={p.id===selectedId} onClick={()=>setSelectedId(p.id)}>{p.id===selectedId?'Selected':'Review'}</SecondaryButton></article>)}</div>}</section>
 {selected&&<section style={panel}><h2>{selected.poNumber} finance evidence</h2><div style={stack}><span><b>Vendor:</b> {selected.vendorCode} · {selected.vendorName}</span><span><b>Procurement request:</b> {selected.requestNumber} · {selected.requestTitle}</span><span><b>PO amount:</b> {money(selected.amountPaise)}</span>{selected.expenseId&&<span><b>Accounting link:</b> {selected.expenseNumber} · {selected.expenseStatus} · linked {selected.linkedAt?new Date(selected.linkedAt).toLocaleString('en-IN'):'—'}</span>}</div>
 {!selected.expenseId&&canManage&&<form onSubmit={createExpense} style={form}><h3>Create expense draft</h3><p style={muted}>This creates a DRAFT SocietyExpense for the exact PO amount. Existing finance approval/posting controls remain unchanged.</p><FormField label="Expense number" value={expenseNumber} onChange={e=>setExpenseNumber(e.target.value)} required maxLength={64}/><div style={grid}><FormField label="Expense date" type="date" value={expenseDate} onChange={e=>setExpenseDate(e.target.value)} required/><FormField label="Due date" type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></div><SelectField label="Expense account" value={expenseAccountId} onChange={e=>setExpenseAccountId(e.target.value)} required><option value="">Select expense account</option>{expenseAccounts.map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</SelectField><SelectField label="Fund (optional)" value={fundId} onChange={e=>setFundId(e.target.value)}><option value="">No fund</option>{funds.map(f=><option key={f.id} value={f.id}>{f.code} · {f.name}</option>)}</SelectField><FormField label="Invoice / reference" value={invoiceReference} onChange={e=>setInvoiceReference(e.target.value)} maxLength={160}/><FormField label="Description" multiline value={description} onChange={e=>setDescription(e.target.value)} maxLength={2000}/><PrimaryButton type="submit" loading={busy} disabled={!expenseAccountId}>Create expense draft</PrimaryButton></form>}
 {!selected.expenseId&&!canManage&&<p style={muted}>Read only. FINANCE_MANAGE permission is required to create the accounting draft.</p>}</section>}
 </PageShell>
}

const panel:React.CSSProperties={marginTop:18,padding:20,border:'1px solid var(--line,#dbe7ea)',borderRadius:16,background:'var(--surface,#fff)'}
const list:React.CSSProperties={display:'grid',gap:10}
const row:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',padding:12,border:'1px solid var(--line,#e2e8f0)',borderRadius:12,flexWrap:'wrap'}
const stack:React.CSSProperties={display:'grid',gap:4}
const form:React.CSSProperties={display:'grid',gap:12,marginTop:18,paddingTop:16,borderTop:'1px solid var(--line,#e2e8f0)'}
const grid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,220px),1fr))',gap:12}
const muted:React.CSSProperties={color:'var(--muted,#475569)'}
