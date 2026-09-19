'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { ActionBar, EmptyState, ErrorState, FormField, PageHeader, PageShell, PrimaryButton, SecondaryButton, SelectField } from '../../../components/admin-ui'

type Session={accessToken:string;role:string;societyName?:string}
type Account={id:string;code:string;name:string;type:string;active:boolean}
type Period={id:string;code:string;name:string;startsOn:string;endsOn:string;status:string}
type Batch={id:string;batchKey:string;entryNumber:string;entryDate:string;description:string;status:string;lineCount:number;debitPaise:string;creditPaise:string;postedAt?:string|null}
type Line={accountId:string;unitId:string;fundId:string;description:string;debit:string;credit:string}

const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
function getSession():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw) as Session:null}catch{return null}}
async function api<T>(s:Session,path:string,init:RequestInit={}):Promise<T>{const r=await fetch(`${base}/api/v1${path}`,{...init,headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.accessToken}`,...init.headers}});const t=await r.text();const b=t?JSON.parse(t):null;if(!r.ok)throw new Error(Array.isArray(b?.message)?b.message.join(', '):b?.message??`Request failed (${r.status})`);return b as T}
const readRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','ACCOUNTANT'])
const manageRoles=new Set(['SUPER_ADMIN','ACCOUNTANT'])
const money=(v:string|number)=>`₹${(Number(v)/100).toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:2})}`
const today=()=>new Date().toISOString().slice(0,10)
const emptyLine=():Line=>({accountId:'',unitId:'',fundId:'',description:'',debit:'',credit:''})

export default function OpeningBalancesPage(){
  const[session,setSession]=useState<Session|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('')
  const[accounts,setAccounts]=useState<Account[]>([]),[periods,setPeriods]=useState<Period[]>([]),[batches,setBatches]=useState<Batch[]>([])
  const[batchKey,setBatchKey]=useState(''),[periodId,setPeriodId]=useState(''),[entryNumber,setEntryNumber]=useState(''),[entryDate,setEntryDate]=useState(today()),[description,setDescription]=useState('Opening balances from legacy system'),[externalReference,setExternalReference]=useState('')
  const[lines,setLines]=useState<Line[]>([emptyLine(),emptyLine()])
  const[postConfirmed,setPostConfirmed]=useState(false)
  const canRead=!!session&&readRoles.has(session.role),canManage=!!session&&manageRoles.has(session.role)

  const load=useCallback(async(s:Session)=>{setLoading(true);setError('');try{const[a,p,b]=await Promise.all([api<Account[]>(s,'/accounting/accounts'),api<Period[]>(s,'/accounting/periods'),api<Batch[]>(s,'/accounting/opening-balances')]);setAccounts(a.filter(x=>x.active));setPeriods(p);setBatches(b);setPeriodId(prev=>prev||p.find(x=>x.status==='OPEN')?.id||'')}catch(e){setError(e instanceof Error?e.message:'Could not load opening balances')}finally{setLoading(false)}},[])
  useEffect(()=>{const s=getSession();setSession(s);if(s&&readRoles.has(s.role))void load(s);else setLoading(false)},[load])

  function updateLine(index:number,field:keyof Line,value:string){setLines(current=>current.map((line,i)=>i===index?{...line,[field]:value}:line))}
  function removeLine(index:number){setLines(current=>current.length<=2?current:current.filter((_,i)=>i!==index))}

  async function submit(e:FormEvent){
    e.preventDefault();if(!session||!canManage)return;setError('');setSuccess('')
    const payloadLines=lines.map(line=>({accountId:line.accountId,unitId:line.unitId||undefined,fundId:line.fundId||undefined,description:line.description||undefined,debitPaise:Math.round(Number(line.debit||0)*100),creditPaise:Math.round(Number(line.credit||0)*100)}))
    if(payloadLines.some(line=>!line.accountId)){setError('Choose a ledger account for every line.');return}
    if(payloadLines.some(line=>!Number.isSafeInteger(line.debitPaise)||!Number.isSafeInteger(line.creditPaise))){setError('Amounts must resolve to whole paise values.');return}
    const debit=payloadLines.reduce((n,line)=>n+line.debitPaise,0),credit=payloadLines.reduce((n,line)=>n+line.creditPaise,0)
    if(debit<=0||debit!==credit){setError('Opening-balance debits and credits must be positive and exactly balanced.');return}
    if(!postConfirmed){setError('Confirm the auditable cutover posting before continuing.');return}
    setBusy(true)
    try{const result=await api<{idempotent:boolean}>(session,'/accounting/opening-balances',{method:'POST',body:JSON.stringify({batchKey,periodId,entryNumber,entryDate,description,externalReference:externalReference||undefined,lines:payloadLines})});setPostConfirmed(false);setSuccess(result.idempotent?'This exact cutover batch was already posted; no duplicate journal was created.':'Opening balances posted successfully.');await load(session)}catch(e){setError(e instanceof Error?e.message:'Could not post opening balances')}finally{setBusy(false)}
  }

  if(loading)return <PageShell><PageHeader title="Opening balances" description="Loading cutover balances…"/></PageShell>
  if(!canRead)return <PageShell><PageHeader title="Finance access required" description="Finance read access is required."/></PageShell>
  return <PageShell>
    <PageHeader context={`${session?.societyName??'Current society'} · V4 finance hardening`} title="Opening balances" description="Establish migration-safe ledger balances before operational accounting starts. Every batch is society-scoped, balanced, idempotent and posted into an open accounting period." actions={<a href="/finance">← Finance workspace</a>}/>
    {error&&<ErrorState title="Opening-balance operation failed" description={error}/>}<ActionBar feedback={success} label="Opening-balance actions"><SecondaryButton disabled={busy} onClick={()=>session&&void load(session)}>Refresh</SecondaryButton></ActionBar>
    {!canManage&&<div style={{marginTop:16,padding:14,border:'1px solid #d5e8eb',background:'#f7fbfc'}}>Read-only finance access. Only Accountant/Treasurer or platform finance roles can post cutover balances.</div>}

    {canManage&&<section style={{marginTop:18,padding:20,border:'1px solid #d5e8eb'}}><h2 style={{marginTop:0}}>Post cutover batch</h2><p>Use a stable batch key from the migration source. Retrying the exact same batch is safe; reusing the key with changed content is rejected.</p><form onSubmit={submit}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>
        <FormField label="Batch key" required value={batchKey} onChange={e=>setBatchKey(e.target.value)} placeholder="legacy-cutover-2026"/>
        <FormField label="Journal number" required value={entryNumber} onChange={e=>setEntryNumber(e.target.value)} placeholder="OB-2026-001"/>
        <FormField label="Cutover date" required type="date" value={entryDate} onChange={e=>setEntryDate(e.target.value)}/>
        <SelectField label="Accounting period" required value={periodId} onChange={e=>setPeriodId(e.target.value)}><option value="">Choose open period</option>{periods.filter(p=>p.status==='OPEN').map(p=><option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</SelectField>
        <FormField label="Description" required value={description} onChange={e=>setDescription(e.target.value)}/>
        <FormField label="Source reference (optional)" value={externalReference} onChange={e=>setExternalReference(e.target.value)} placeholder="Legacy export file / migration reference"/>
      </div>
      <h3>Balanced journal lines</h3><div style={{overflowX:'auto'}}><table><thead><tr><th>Account</th><th>Unit UUID (optional)</th><th>Fund UUID (optional)</th><th>Description</th><th>Debit ₹</th><th>Credit ₹</th><th></th></tr></thead><tbody>{lines.map((line,index)=><tr key={index}><td><select required value={line.accountId} onChange={e=>updateLine(index,'accountId',e.target.value)}><option value="">Choose</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></td><td><input value={line.unitId} onChange={e=>updateLine(index,'unitId',e.target.value)} placeholder="UUID"/></td><td><input value={line.fundId} onChange={e=>updateLine(index,'fundId',e.target.value)} placeholder="UUID"/></td><td><input value={line.description} onChange={e=>updateLine(index,'description',e.target.value)}/></td><td><input type="number" min="0" step="0.01" value={line.debit} onChange={e=>updateLine(index,'debit',e.target.value)}/></td><td><input type="number" min="0" step="0.01" value={line.credit} onChange={e=>updateLine(index,'credit',e.target.value)}/></td><td><SecondaryButton type="button" disabled={lines.length<=2} onClick={()=>removeLine(index)}>Remove</SecondaryButton></td></tr>)}</tbody></table></div>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,marginTop:14,flexWrap:'wrap'}}><SecondaryButton type="button" onClick={()=>setLines(current=>[...current,emptyLine()])}>Add line</SecondaryButton><div style={confirmation}><label style={confirmRow}><input type="checkbox" checked={postConfirmed} onChange={e=>setPostConfirmed(e.target.checked)}/><span>I confirm this creates an auditable posted journal and represents the legacy cutover.</span></label><PrimaryButton type="submit" loading={busy} disabled={!batchKey||!periodId||!entryNumber}>Post opening balances</PrimaryButton></div></div>
    </form></section>}

    <section style={{marginTop:18,padding:20,border:'1px solid #d5e8eb'}}><h2 style={{marginTop:0}}>Cutover history</h2>{batches.length===0?<EmptyState title="No opening-balance batches posted"/>:<div style={{overflowX:'auto'}}><table><thead><tr><th>Batch</th><th>Journal</th><th>Date</th><th>Status</th><th>Lines</th><th>Balanced total</th></tr></thead><tbody>{batches.map(b=><tr key={b.id}><td><b>{b.batchKey}</b><br/><small>{b.description}</small></td><td>{b.entryNumber}</td><td>{new Date(b.entryDate).toLocaleDateString('en-IN')}</td><td>{b.status}</td><td>{b.lineCount}</td><td>{money(b.debitPaise)}</td></tr>)}</tbody></table></div>}</section>
  </PageShell>
}

const confirmation:React.CSSProperties={display:'grid',gap:8,maxWidth:520}
const confirmRow:React.CSSProperties={display:'grid',gridTemplateColumns:'auto 1fr',gap:8,alignItems:'start'}
