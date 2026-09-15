'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'

type Session={accessToken:string;role:string;societyName?:string}
type ExportJob={id:string;contractVersion:string;format:'CSV'|'JSONL';fromDate:string;toDate:string;status:string;recordCount:number|null;artifactKey:string|null;errorCode:string|null;createdAt:string;completedAt:string|null}
type Delivery={id:string;exportJobId:string;provider:string;status:string;attemptCount:number;lastAttemptAt:string|null;nextAttemptAt:string|null;providerReceiptId:string|null;failureCode:string|null;failureMessage:string|null;createdAt:string;updatedAt:string;completedAt:string|null}

const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
const readRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','ACCOUNTANT'])
const contractVersion='aaraagate.accounting.journal.v1'
const today=()=>new Date().toISOString().slice(0,10)
function session():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw) as Session:null}catch{return null}}
async function api<T>(s:Session,path:string,init:RequestInit={}):Promise<T>{const r=await fetch(`${base}/api/v1${path}`,{...init,headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.accessToken}`,...init.headers}});const text=await r.text();const body=text?JSON.parse(text):null;if(!r.ok)throw new Error(Array.isArray(body?.message)?body.message.join(', '):body?.message??`Request failed (${r.status})`);return body as T}
async function downloadArtifact(s:Session,job:ExportJob){const r=await fetch(`${base}/api/v1/accounting/exports/${job.id}/artifact`,{headers:{Authorization:`Bearer ${s.accessToken}`}});if(!r.ok){const text=await r.text();let message=`Download failed (${r.status})`;try{const body=text?JSON.parse(text):null;message=Array.isArray(body?.message)?body.message.join(', '):body?.message??message}catch{}throw new Error(message)}const blob=await r.blob();const disposition=r.headers.get('content-disposition')??'';const match=disposition.match(/filename="?([^";]+)"?/i);const filename=match?.[1]??`aaraagate-accounting-${job.id}.${job.format==='CSV'?'csv':'jsonl'}`;const href=URL.createObjectURL(blob);try{const link=document.createElement('a');link.href=href;link.download=filename;document.body.appendChild(link);link.click();link.remove()}finally{URL.revokeObjectURL(href)}}

export default function AccountingExportsPage(){
  const[s,setS]=useState<Session|null>(null),[jobs,setJobs]=useState<ExportJob[]>([]),[deliveries,setDeliveries]=useState<Delivery[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[downloadingId,setDownloadingId]=useState<string|null>(null),[error,setError]=useState('')
  const[fromDate,setFromDate]=useState(today()),[toDate,setToDate]=useState(today()),[format,setFormat]=useState<'CSV'|'JSONL'>('CSV')
  const canRead=!!s&&readRoles.has(s.role)
  const load=useCallback(async(x:Session)=>{setLoading(true);setError('');try{const[j,d]=await Promise.all([api<ExportJob[]>(x,'/accounting/exports'),api<Delivery[]>(x,'/accounting/connector-deliveries')]);setJobs(j);setDeliveries(d)}catch(err){setError(err instanceof Error?err.message:'Could not load accounting exports')}finally{setLoading(false)}},[])
  useEffect(()=>{const x=session();setS(x);if(x&&readRoles.has(x.role))void load(x);else setLoading(false)},[load])

  async function createExport(e:FormEvent){e.preventDefault();if(!s||!canRead)return;setBusy(true);setError('');try{await api<ExportJob>(s,'/accounting/exports',{method:'POST',body:JSON.stringify({idempotencyKey:`admin-${Date.now()}`,contractVersion,format,fromDate,toDate})});await load(s)}catch(err){setError(err instanceof Error?err.message:'Could not create accounting export')}finally{setBusy(false)}}
  async function download(job:ExportJob){if(!s||job.status!=='COMPLETED'||!job.artifactKey)return;setDownloadingId(job.id);setError('');try{await downloadArtifact(s,job)}catch(err){setError(err instanceof Error?err.message:'Could not download accounting export')}finally{setDownloadingId(null)}}
  const deliveryByExport=new Map(deliveries.map(d=>[d.exportJobId,d]))

  if(loading)return <main style={{padding:32}}>Loading accounting exports…</main>
  if(!canRead)return <main style={{padding:32}}><h1>Finance access required</h1><a href="/finance">Return to Finance</a></main>

  return <main style={{maxWidth:1320,margin:'0 auto',padding:'28px 22px 80px'}}>
    <header style={header}><div><small>{s?.societyName??'Current society'} · {s?.role.replaceAll('_',' ')}</small><h1 style={{margin:'4px 0'}}>Accounting exports</h1><p style={{margin:0}}>Create provider-neutral exports and review downstream connector delivery evidence.</p></div><button style={secondary} onClick={()=>s&&void load(s)} disabled={busy||!!downloadingId}>Refresh</button></header>
    {error&&<div style={errorBox}>{error}</div>}
    <section style={panel}><h2 style={{marginTop:0}}>New export job</h2><form onSubmit={createExport} style={grid}><label>From<input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} style={input} required/></label><label>To<input type="date" value={toDate} onChange={e=>setToDate(e.target.value)} style={input} required/></label><label>Format<select value={format} onChange={e=>setFormat(e.target.value as 'CSV'|'JSONL')} style={input}><option value="CSV">CSV</option><option value="JSONL">JSONL</option></select></label><label>Contract<input value={contractVersion} readOnly style={input}/></label><button disabled={busy||!!downloadingId} style={primary}>{busy?'Creating…':'Queue export'}</button></form><p style={{marginBottom:0,color:'#475569'}}>Exports are limited to a maximum 366-day range. Artifact downloads remain authenticated. Connector delivery is shown only when the server-side integration is explicitly enabled.</p></section>
    <section style={panel}><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}><h2 style={{margin:0}}>Recent jobs</h2><small>{jobs.length} shown</small></div>{jobs.length===0?<p>No accounting export jobs yet.</p>:<div style={{overflowX:'auto',marginTop:12}}><table style={table}><thead><tr><th>Created</th><th>Range</th><th>Format</th><th>Export</th><th>Records</th><th>Connector delivery</th><th>Artifact</th></tr></thead><tbody>{jobs.map(j=>{const d=deliveryByExport.get(j.id);return <tr key={j.id}><td><b>{new Date(j.createdAt).toLocaleString('en-IN')}</b><br/><small>{j.id}</small></td><td>{new Date(j.fromDate).toLocaleDateString('en-IN')} – {new Date(j.toDate).toLocaleDateString('en-IN')}</td><td>{j.format}</td><td><span style={status(j.status)}>{j.status}</span>{j.errorCode&&<><br/><small>{j.errorCode}</small></>}</td><td>{j.recordCount??'—'}</td><td>{d?<><span style={status(d.status)}>{d.status}</span><br/><small>{d.provider} · attempt {d.attemptCount}</small>{d.providerReceiptId&&<><br/><small>Receipt: {d.providerReceiptId}</small></>}{d.failureCode&&<><br/><small>{d.failureCode}</small></>}</>:<small>Not queued</small>}</td><td>{j.status==='COMPLETED'&&j.artifactKey?<button style={secondary} disabled={downloadingId===j.id} onClick={()=>void download(j)}>{downloadingId===j.id?'Downloading…':`Download ${j.format}`}</button>:j.status==='FAILED'?<small>Generation failed</small>:<small>Not ready</small>}</td></tr>})}</tbody></table></div>}</section>
  </main>
}

const header:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap'}
const panel:React.CSSProperties={marginTop:20,padding:20,border:'1px solid #dbe7ea',borderRadius:16,background:'white'}
const grid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,alignItems:'end'}
const input:React.CSSProperties={display:'block',width:'100%',boxSizing:'border-box',marginTop:6,padding:10,border:'1px solid #cbd5e1',borderRadius:10,font:'inherit'}
const primary:React.CSSProperties={padding:'10px 14px',borderRadius:10,border:'1px solid #0f766e',background:'#0f766e',color:'white',fontWeight:700,cursor:'pointer'}
const secondary:React.CSSProperties={padding:'10px 14px',borderRadius:10,border:'1px solid #cbd5e1',background:'white',fontWeight:700,cursor:'pointer'}
const errorBox:React.CSSProperties={marginTop:16,padding:12,border:'1px solid #fecaca',borderRadius:12,background:'#fef2f2',color:'#991b1b'}
const table:React.CSSProperties={width:'100%',borderCollapse:'collapse'}
function status(value:string):React.CSSProperties{return {display:'inline-block',padding:'4px 8px',borderRadius:999,border:'1px solid #cbd5e1',fontSize:12,fontWeight:700,background:['COMPLETED','DELIVERED'].includes(value)?'#ecfdf5':value==='FAILED'?'#fef2f2':'#f8fafc'}}
