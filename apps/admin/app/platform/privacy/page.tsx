'use client'

import { useCallback, useEffect, useState } from 'react'

type Session={accessToken:string;role:string}
type PrivacyCase={
  id:string
  subjectUserId:string
  subjectName?:string|null
  subjectPhone?:string|null
  requestType:'ACCESS'|'CORRECTION'|'ERASURE'|'OTHER'
  status:'OPEN'|'IN_REVIEW'|'WAITING'|'COMPLETED'|'REJECTED'|'CANCELLED'
  requestSummary:string
  legalHold:boolean
  retentionReason?:string|null
  createdAt:string
  updatedAt:string
}
const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
function getSession():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw) as Session:null}catch{return null}}
async function api<T>(s:Session,path:string,init:RequestInit={}):Promise<T>{const r=await fetch(`${base}/api/v1${path}`,{...init,headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.accessToken}`,...init.headers}});const text=await r.text();const body=text?JSON.parse(text):null;if(!r.ok)throw new Error(body?.message??`Request failed (${r.status})`);return body as T}

export default function PlatformPrivacyPage(){
  const[s,setS]=useState<Session|null>(null)
  const[cases,setCases]=useState<PrivacyCase[]>([])
  const[loading,setLoading]=useState(true)
  const[busy,setBusy]=useState('')
  const[error,setError]=useState('')

  const load=useCallback(async(x:Session)=>{setLoading(true);setError('');try{setCases(await api<PrivacyCase[]>(x,'/platform/privacy/cases'))}catch(e){setError(e instanceof Error?e.message:'Privacy cases could not be loaded')}finally{setLoading(false)}},[])
  useEffect(()=>{const x=getSession();setS(x);if(x?.role==='SUPER_ADMIN')void load(x);else setLoading(false)},[load])

  const setStatus=async(row:PrivacyCase,status:PrivacyCase['status'])=>{if(!s)return;const note=prompt(`Update ${row.requestType.toLowerCase()} request to ${status.toLowerCase().replaceAll('_',' ')}. Optional note:`,'');if(note===null)return;setBusy(row.id);setError('');try{await api(s,`/platform/privacy/cases/${row.id}/status`,{method:'PATCH',body:JSON.stringify({status,note:note.trim()||undefined})});await load(s)}catch(e){setError(e instanceof Error?e.message:'Privacy case status could not be updated')}finally{setBusy('')}}
  const setHold=async(row:PrivacyCase)=>{if(!s)return;const next=!row.legalHold;let retentionReason:string|undefined;if(next){const reason=prompt('Reason for retaining this data while the request is reviewed:','');if(reason===null)return;if(reason.trim().length<3){setError('Enter a retention reason of at least 3 characters.');return}retentionReason=reason.trim()}setBusy(row.id);setError('');try{await api(s,`/platform/privacy/cases/${row.id}/legal-hold`,{method:'PATCH',body:JSON.stringify({legalHold:next,retentionReason})});await load(s)}catch(e){setError(e instanceof Error?e.message:'Legal-hold state could not be updated')}finally{setBusy('')}}

  if(loading)return <main style={{padding:32}}>Loading platform privacy requests…</main>
  if(!s||s.role!=='SUPER_ADMIN')return <main style={{padding:32}}><h1>Platform access required</h1><a href="/">Return to Admin</a></main>

  return <main style={{maxWidth:1160,margin:'0 auto',padding:'28px 22px 80px'}}>
    <header style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap'}}>
      <div><small>SUPER ADMIN · PRIVACY OPERATIONS</small><h1 style={{margin:'4px 0'}}>Independent-home privacy requests</h1><p style={{margin:0}}>Society-less requests are processed here. Society privacy cases remain inside each society privacy workspace.</p></div>
      <div style={{display:'flex',gap:12}}><button onClick={()=>void load(s)} disabled={!!busy} style={secondary}>Refresh</button><a href="/">Admin console</a></div>
    </header>
    {error&&<div style={errorBox}>{error}</div>}
    <section style={panel}>
      {cases.length===0?<p>No independent-home privacy requests are waiting.</p>:<div style={{display:'grid',gap:12}}>
        {cases.map(row=><article key={row.id} style={card}>
          <div style={{flex:'1 1 520px'}}>
            <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><b style={{fontSize:17}}>{row.requestType.replaceAll('_',' ')}</b><span style={pill}>{row.status.replaceAll('_',' ')}</span>{row.legalHold&&<span style={holdPill}>RETENTION HOLD</span>}</div>
            <div style={{marginTop:6}}>{row.requestSummary}</div>
            <small>{[row.subjectName,row.subjectPhone].filter(Boolean).join(' · ')||row.subjectUserId} · submitted {new Date(row.createdAt).toLocaleString('en-IN')}</small>
            {row.legalHold&&row.retentionReason&&<p style={{margin:'8px 0 0'}}><small>Retention reason: {row.retentionReason}</small></p>}
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}>
            {['OPEN','WAITING'].includes(row.status)&&<button disabled={!!busy} onClick={()=>void setStatus(row,'IN_REVIEW')} style={primary}>Review</button>}
            {!['COMPLETED','REJECTED','CANCELLED'].includes(row.status)&&<button disabled={!!busy} onClick={()=>void setStatus(row,'COMPLETED')} style={primary}>Complete</button>}
            {!['COMPLETED','REJECTED','CANCELLED'].includes(row.status)&&<button disabled={!!busy} onClick={()=>void setStatus(row,'REJECTED')} style={secondary}>Reject</button>}
            {!['COMPLETED','REJECTED','CANCELLED'].includes(row.status)&&<button disabled={!!busy} onClick={()=>void setHold(row)} style={secondary}>{row.legalHold?'Release hold':'Add hold'}</button>}
          </div>
        </article>)}
      </div>}
    </section>
    <section style={note}><b>Control boundary</b><p style={{margin:'6px 0 0'}}>Completing an erasure request is blocked by the API while a legal hold is active. Completion records workflow resolution; it does not bypass retention or automatically delete records.</p></section>
  </main>
}
const panel:React.CSSProperties={marginTop:20,padding:20,border:'1px solid #dbe7ea',borderRadius:16,background:'white'}
const card:React.CSSProperties={padding:16,border:'1px solid #e5e7eb',borderRadius:14,display:'flex',gap:16,justifyContent:'space-between',alignItems:'center',flexWrap:'wrap'}
const primary:React.CSSProperties={padding:'9px 12px',border:0,borderRadius:9,background:'#111827',color:'white',fontWeight:700,cursor:'pointer'}
const secondary:React.CSSProperties={padding:'9px 12px',border:'1px solid #d1d5db',borderRadius:9,background:'white',fontWeight:700,cursor:'pointer'}
const pill:React.CSSProperties={padding:'4px 8px',borderRadius:999,background:'#eef2ff',fontSize:12,fontWeight:800}
const holdPill:React.CSSProperties={padding:'4px 8px',borderRadius:999,background:'#fef3c7',fontSize:12,fontWeight:800}
const errorBox:React.CSSProperties={marginTop:16,padding:12,background:'#fee2e2',borderRadius:10}
const note:React.CSSProperties={marginTop:16,padding:16,borderRadius:14,background:'#f8fafc'}
