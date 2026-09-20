'use client'
import { FormEvent,useCallback,useEffect,useState } from 'react'
import { ActionBar, DangerButton, EmptyState, ErrorState, FormField, PageHeader, PageShell, PrimaryButton, SecondaryButton, SelectField, StatusPill } from '../../../components/admin-ui'

type Session={accessToken:string;role:string;societyName?:string}
type Receivable={id:string;receivableNumber:string;description:string;outstandingPaise:string}
type Waiver={id:string;entryNumber:string;entryDate:string;description:string;status:string;sourceType:string;sourceId?:string;externalReference?:string;createdByUserId:string;postedByUserId?:string|null;postedAt?:string|null}
const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
const manageRoles=new Set(['SUPER_ADMIN','ACCOUNTANT'])
function getSession():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw) as Session:null}catch{return null}}
async function api<T>(s:Session,path:string,init:RequestInit={}):Promise<T>{const r=await fetch(`${base}/api/v1${path}`,{...init,headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.accessToken}`,...init.headers}});const t=await r.text();const b=t?JSON.parse(t):null;if(!r.ok)throw new Error(Array.isArray(b?.message)?b.message.join(', '):b?.message??`Request failed (${r.status})`);return b as T}
const money=(v:string|number)=>`₹${(Number(v)/100).toLocaleString('en-IN',{maximumFractionDigits:2})}`
const today=()=>new Date().toISOString().slice(0,10)

export default function WaiverWorkspace(){
 const[session,setSession]=useState<Session|null>(null),[rows,setRows]=useState<Waiver[]>([]),[receivables,setReceivables]=useState<Receivable[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[success,setSuccess]=useState('')
 const[receivableId,setReceivableId]=useState(''),[amount,setAmount]=useState(''),[reason,setReason]=useState(''),[entryNumber,setEntryNumber]=useState(''),[requestKey,setRequestKey]=useState('')
 const[reviewId,setReviewId]=useState(''),[reviewDecision,setReviewDecision]=useState<'approve'|'reject'>('approve'),[reviewReason,setReviewReason]=useState('')
 const load=useCallback(async(s:Session)=>{setError('');try{const[w,r]=await Promise.all([api<Waiver[]>(s,'/accounting/waivers/requests'),api<Receivable[]>(s,'/accounting/receivables')]);setRows(w);setReceivables(r)}catch(e){setError(e instanceof Error?e.message:'Could not load waiver controls')}},[])
 useEffect(()=>{const s=getSession();setSession(s);if(s)void load(s)},[load])
 const canManage=!!session&&manageRoles.has(session.role)

 async function submit(e:FormEvent){e.preventDefault();if(!session||!canManage)return;const rupees=Number(amount);if(!Number.isFinite(rupees)||rupees<=0){setError('Enter a positive waiver amount.');return}setBusy(true);setError('');setSuccess('');try{await api(session,'/accounting/waivers/requests',{method:'POST',body:JSON.stringify({receivableId,amountPaise:Math.round(rupees*100),reason,entryDate:today(),journalEntryNumber:entryNumber,requestKey})});setAmount('');setReason('');setEntryNumber('');setRequestKey('');setSuccess('Waiver request submitted for maker–checker review.');await load(session)}catch(e){setError(e instanceof Error?e.message:'Could not submit waiver request')}finally{setBusy(false)}}
 function prepareReview(id:string,decision:'approve'|'reject'){setReviewId(id);setReviewDecision(decision);setReviewReason('');setError('');setSuccess('')}
 async function review(e:FormEvent){e.preventDefault();if(!session||!canManage||!reviewId)return;const reason=reviewReason.trim();if(reviewDecision==='reject'&&!reason){setError('Enter a rejection reason.');return}setBusy(true);setError('');setSuccess('');try{await api(session,`/accounting/waivers/requests/${reviewId}/${reviewDecision}`,{method:'POST',body:reviewDecision==='reject'?JSON.stringify({reason}):undefined});setReviewId('');setReviewReason('');setSuccess(`Waiver request ${reviewDecision==='approve'?'approved':'rejected'}.`);await load(session)}catch(e){setError(e instanceof Error?e.message:'Could not review waiver request')}finally{setBusy(false)}}

 if(!session)return <PageShell><PageHeader title="Finance access required"/></PageShell>
 return <PageShell>
  <PageHeader context={`${session.societyName??'Current society'} · ${session.role.replaceAll('_',' ')}`} title="Waiver approvals" description="Maker–checker control for high-impact receivable waivers. Debit and credit notes remain append-only finance adjustments; waivers require a different finance reviewer." actions={<a href="/finance">← Finance workspace</a>}/>
  {error&&<ErrorState title="Waiver operation failed" description={error}/>}
  <ActionBar feedback={success} label="Waiver workspace actions"><SecondaryButton disabled={busy} onClick={()=>void load(session)}>Refresh</SecondaryButton></ActionBar>

  {canManage&&<section style={panel}><h2>Request waiver</h2><form onSubmit={submit} style={formGrid}>
   <SelectField label="Receivable" required value={receivableId} onChange={e=>setReceivableId(e.target.value)}><option value="">Choose receivable</option>{receivables.filter(r=>Number(r.outstandingPaise)>0).map(r=><option key={r.id} value={r.id}>{r.receivableNumber} · {money(r.outstandingPaise)}</option>)}</SelectField>
   <FormField label="Amount (₹)" required type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/>
   <FormField label="Journal number" required value={entryNumber} onChange={e=>setEntryNumber(e.target.value)} placeholder="WV-2026-0001"/>
   <FormField label="Stable request key" required value={requestKey} onChange={e=>setRequestKey(e.target.value)} placeholder="waiver-unit-period-001"/>
   <FormField label="Reason" multiline required value={reason} onChange={e=>setReason(e.target.value)}/>
   <ActionBar feedback={success}><PrimaryButton type="submit" loading={busy} disabled={!receivableId||!amount||!reason||!entryNumber||!requestKey}>Submit for approval</PrimaryButton></ActionBar>
  </form></section>}

  <section style={panel}><h2>Waiver requests</h2>{rows.length===0?<EmptyState title="No waiver requests"/>:<div style={list}>{rows.map(w=><article key={w.id} style={item}><div><div style={statusRow}><strong>{w.entryNumber}</strong><StatusPill label={w.sourceType==='WAIVER_REQUEST'&&w.status==='DRAFT'?'PENDING APPROVAL':w.sourceType==='WAIVER_REQUEST_REJECTED'?'REJECTED':w.status} tone={w.sourceType==='WAIVER_REQUEST_REJECTED'?'danger':w.status==='POSTED'?'success':'warning'}/></div><p>{w.description}</p><small>{new Date(w.entryDate).toLocaleDateString('en-IN')}</small></div>{canManage&&w.sourceType==='WAIVER_REQUEST'&&w.status==='DRAFT'&&<ActionBar label={`Review ${w.entryNumber}`}><PrimaryButton disabled={busy} onClick={()=>prepareReview(w.id,'approve')}>Approve</PrimaryButton><DangerButton disabled={busy} onClick={()=>prepareReview(w.id,'reject')}>Reject</DangerButton></ActionBar>}</article>)}</div>}</section>

  {reviewId&&canManage&&<form onSubmit={review} style={panel}><h2>Confirm {reviewDecision==='approve'?'approval':'rejection'}</h2><p>The requester cannot review their own request; the API enforces maker–checker segregation of duties.</p>{reviewDecision==='reject'&&<FormField label="Rejection reason" required multiline value={reviewReason} onChange={e=>setReviewReason(e.target.value)}/>}<ActionBar feedback={success}>{reviewDecision==='approve'?<PrimaryButton type="submit" loading={busy}>Confirm approval</PrimaryButton>:<DangerButton type="submit" loading={busy}>Confirm rejection</DangerButton>}<SecondaryButton type="button" onClick={()=>{setReviewId('');setReviewReason('')}}>Cancel</SecondaryButton></ActionBar></form>}
 </PageShell>
}
const panel:React.CSSProperties={display:'grid',gap:14,marginTop:18,padding:20,border:'1px solid var(--line,#d5e8eb)',borderRadius:18,background:'var(--surface,#fff)'}
const formGrid:React.CSSProperties={display:'grid',gap:12,gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,220px),1fr))'}
const list:React.CSSProperties={display:'grid',gap:10}
const item:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',padding:14,border:'1px solid var(--line,#d5e8eb)',borderRadius:14,flexWrap:'wrap'}
const statusRow:React.CSSProperties={display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}
