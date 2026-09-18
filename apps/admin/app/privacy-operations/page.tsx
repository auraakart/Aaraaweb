'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'

type Session={accessToken:string;role:string;societyName?:string}
type PrivacyCase={
  id:string
  subjectUserId:string
  requestType:'ACCESS'|'CORRECTION'|'ERASURE'|'OTHER'
  requestSummary:string
  status:string
  legalHold?:boolean
  retentionReason?:string|null
  retentionDecision?:'ALLOW'|'BLOCK'|null
  retentionDecisionReason?:string|null
  assignedToUserId?:string|null
  dueAt?:string|null
  createdAt?:string
}
type History={id:string;action?:string;status?:string;note?:string|null;occurredAt?:string;actorUserId?:string}
type ErasurePlan={executable:boolean;blockers:string[];erase:string[];retain:string[]}

const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
const readRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','AUDITOR'])

function getSession():Session|null{
  try{
    const raw=sessionStorage.getItem('aaraagate.admin.session')
    return raw?JSON.parse(raw) as Session:null
  }catch{return null}
}

async function api<T>(session:Session,path:string,init:RequestInit={}):Promise<T>{
  const response=await fetch(`${base}/api/v1${path}`,{
    ...init,
    headers:{
      Accept:'application/json',
      'Content-Type':'application/json',
      Authorization:`Bearer ${session.accessToken}`,
      ...init.headers,
    },
  })
  const text=await response.text()
  const body=text?JSON.parse(text):null
  if(!response.ok)throw new Error(body?.message??`Request failed (${response.status})`)
  return body as T
}

export default function PrivacyOperationsPage(){
  const session=typeof window==='undefined'?null:getSession()
  const s=session
  const allowed=!!session&&readRoles.has(session.role)
  const canManage=s?.role==='SUPER_ADMIN'

  const[cases,setCases]=useState<PrivacyCase[]>([])
  const[selectedId,setSelectedId]=useState('')
  const[history,setHistory]=useState<History[]>([])
  const[loading,setLoading]=useState(true)
  const[busy,setBusy]=useState(false)
  const[error,setError]=useState('')
  const[success,setSuccess]=useState('')
  const[subjectUserId,setSubjectUserId]=useState('')
  const[requestType,setRequestType]=useState<PrivacyCase['requestType']>('ACCESS')
  const[summary,setSummary]=useState('')

  const selected=cases.find(item=>item.id===selectedId)??null

  const load=useCallback(async()=>{
    if(!session||!allowed)return
    setLoading(true)
    setError('')
    try{
      const rows=await api<PrivacyCase[]>(session,'/privacy/cases')
      setCases(rows)
      setSelectedId(current=>current&&rows.some(row=>row.id===current)?current:rows[0]?.id??'')
    }catch(cause){
      setError(cause instanceof Error?cause.message:'Privacy cases could not be loaded')
    }finally{
      setLoading(false)
    }
  },[session?.accessToken,allowed])

  const loadHistory=useCallback(async(id:string)=>{
    if(!session||!id)return
    try{
      setHistory(await api<History[]>(session,`/privacy/cases/${id}/history`))
    }catch(cause){
      setError(cause instanceof Error?cause.message:'Privacy case history could not be loaded')
    }
  },[session?.accessToken])

  useEffect(()=>{void load()},[load])
  useEffect(()=>{if(selectedId)void loadHistory(selectedId)},[selectedId,loadHistory])

  const run=async(task:()=>Promise<void>,message:string)=>{
    setBusy(true);setError('');setSuccess('')
    try{
      await task()
      setSuccess(message)
      await load()
      if(selectedId)await loadHistory(selectedId)
    }catch(cause){
      setError(cause instanceof Error?cause.message:'Privacy operation failed')
    }finally{
      setBusy(false)
    }
  }

  const createCase=(event:FormEvent)=>{
    event.preventDefault()
    if(!session||!canManage)return
    void run(async()=>{
      await api(session,'/privacy/cases',{
        method:'POST',
        body:JSON.stringify({
          subjectUserId:subjectUserId.trim(),
          requestType,
          requestSummary:summary.trim(),
        }),
      })
      setSubjectUserId('')
      setSummary('')
    },'Privacy request case created.')
  }

  const setStatus=()=>{
    if(!session||!canManage||!selected)return
    const status=prompt('New status: OPEN, IN_REVIEW, WAITING, COMPLETED, REJECTED or CANCELLED',selected.status)
    if(!status)return
    const note=prompt('Decision / status note (optional)')??''
    void run(
      ()=>api(session,`/privacy/cases/${selected.id}/status`,{
        method:'PATCH',
        body:JSON.stringify({status:status.trim().toUpperCase(),note:note.trim()||undefined}),
      }).then(()=>undefined),
      'Privacy case status updated.',
    )
  }

  const toggleHold=()=>{
    if(!session||!canManage||!selected)return
    const next=!selected.legalHold
    const reason=prompt(next?'Retention/legal-hold reason':'Reason for releasing hold (optional)')??''
    void run(
      ()=>api(session,`/privacy/cases/${selected.id}/legal-hold`,{
        method:'PATCH',
        body:JSON.stringify({legalHold:next,retentionReason:reason.trim()||undefined}),
      }).then(()=>undefined),
      next?'Legal hold applied.':'Legal hold released.',
    )
  }

  const setRetentionReview=()=>{
    if(!session||!canManage||!selected||selected.requestType!=='ERASURE')return
    const raw=prompt('Retention decision: ALLOW or BLOCK',selected.retentionDecision??'BLOCK')
    const decision=raw?.trim().toUpperCase()
    if(decision!=='ALLOW'&&decision!=='BLOCK')return
    const reason=prompt('Retention decision reason (required)')?.trim()
    if(!reason)return
    void run(
      ()=>api(session,`/privacy/cases/${selected.id}/retention-review`,{
        method:'PATCH',
        body:JSON.stringify({decision,reason}),
      }).then(()=>undefined),
      'Retention review recorded.',
    )
  }

  const showErasurePlan=()=>{
    if(!session||!selected||selected.requestType!=='ERASURE')return
    void run(async()=>{
      const plan=await api<ErasurePlan>(session,`/privacy/cases/${selected.id}/erasure-plan`)
      alert([
        `Executable: ${plan.executable?'YES':'NO'}`,
        `Blockers: ${plan.blockers.join(', ')||'none'}`,
        '',
        'Erase/minimise:',
        ...plan.erase.map(item=>`• ${item}`),
        '',
        'Retain:',
        ...plan.retain.map(item=>`• ${item}`),
      ].join('\n'))
    },'Erasure plan refreshed.')
  }

  const executeErasure=()=>{
    if(!session||!canManage||!selected||selected.requestType!=='ERASURE')return
    if(!confirm('Execute the governed erasure/minimisation plan for this case? This cannot restore removed runtime identifiers.'))return
    void run(
      ()=>api(session,`/privacy/cases/${selected.id}/execute-erasure`,{method:'POST'}).then(()=>undefined),
      'Erasure/minimisation executed.',
    )
  }

  if(!session||!allowed){
    return <main style={page}><h1>Privacy operations access required</h1><a href={session?.role==='AUDITOR'?'/audit':'/'}>Return</a></main>
  }

  return <main style={page}>
    <header style={header}>
      <div>
        <small>{session.societyName??'Current society'} · {session.role.replaceAll('_',' ')}</small>
        <h1>Privacy request operations</h1>
        <p>{canManage?'Manage auditable data-access/correction/erasure cases and retention controls.':'Read-only privacy case evidence. Decisions and erasure execution are not available.'}</p>
      </div>
      <a href={session.role==='AUDITOR'?'/audit':'/'}>← Back</a>
    </header>

    {error&&<p style={err} role="alert">{error}</p>}
    {success&&<p style={ok} role="status">{success}</p>}

    {canManage&&<form onSubmit={createCase} style={panel}>
      <h2>Create privacy case</h2>
      <div style={grid}>
        <label style={label}>Subject user UUID
          <input style={input} value={subjectUserId} onChange={event=>setSubjectUserId(event.target.value)} required/>
        </label>
        <label style={label}>Request type
          <select style={input} value={requestType} onChange={event=>setRequestType(event.target.value as PrivacyCase['requestType'])}>
            {['ACCESS','CORRECTION','ERASURE','OTHER'].map(value=><option key={value}>{value}</option>)}
          </select>
        </label>
      </div>
      <label style={label}>Request summary
        <textarea style={input} value={summary} onChange={event=>setSummary(event.target.value)} required maxLength={2000}/>
      </label>
      <button style={primary} disabled={busy}>Create case</button>
    </form>}

    <div style={layout}>
      <section style={panel}>
        <h2>Cases</h2>
        {loading?<p>Loading…</p>:cases.length===0?<p>No privacy cases.</p>:cases.map(item=>
          <button key={item.id} onClick={()=>setSelectedId(item.id)} style={{...caseButton,...(item.id===selectedId?selectedCaseStyle:{})}}>
            <b>{item.requestType} · {item.status}</b>
            <span>{item.requestSummary}</span>
            <small>Subject {item.subjectUserId.slice(0,8)}…{item.legalHold?' · LEGAL HOLD':''}</small>
          </button>
        )}
      </section>

      <section style={panel}>
        {!selected?<p>Select a case.</p>:<>
          <div style={header}>
            <div><h2 style={{margin:0}}>{selected.requestType}</h2><p>{selected.requestSummary}</p></div>
            <b>{selected.status}</b>
          </div>
          <p>Subject user: <code>{selected.subjectUserId}</code></p>
          <p>Legal hold: <b>{selected.legalHold?'Yes':'No'}</b>{selected.retentionReason?` · ${selected.retentionReason}`:''}</p>
          {selected.requestType==='ERASURE'&&
            <p>Retention review: <b>{selected.retentionDecision??'PENDING'}</b>{selected.retentionDecisionReason?` · ${selected.retentionDecisionReason}`:''}</p>}

          {canManage&&<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button style={primary} disabled={busy} onClick={setStatus}>Update status</button>
            <button style={secondary} disabled={busy} onClick={toggleHold}>{selected.legalHold?'Release legal hold':'Apply legal hold'}</button>
            {selected.requestType==='ERASURE'&&<>
              <button style={secondary} disabled={busy} onClick={setRetentionReview}>Retention review</button>
              <button style={secondary} disabled={busy} onClick={showErasurePlan}>Preview erasure plan</button>
              <button style={primary} disabled={busy||selected.retentionDecision!=='ALLOW'||!!selected.legalHold} onClick={executeErasure}>Execute erasure</button>
            </>}
          </div>}

          <h3>History</h3>
          {history.length===0?<p>No history entries.</p>:history.map((entry,index)=>
            <article key={entry.id??String(index)} style={historyRow}>
              <b>{entry.action??entry.status??'CASE_EVENT'}</b>
              <small>{entry.occurredAt?new Date(entry.occurredAt).toLocaleString('en-IN'):''}</small>
              {entry.note&&<span>{entry.note}</span>}
            </article>
          )}
        </>}
      </section>
    </div>
  </main>
}

const page:React.CSSProperties={maxWidth:1180,margin:'0 auto',padding:'28px 22px 80px'}
const header:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap'}
const panel:React.CSSProperties={marginTop:18,padding:20,border:'1px solid #dbe7ea',borderRadius:16,background:'white'}
const grid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:12}
const layout:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,360px),1fr))',gap:18}
const label:React.CSSProperties={display:'grid',gap:6,marginTop:10,fontWeight:700}
const input:React.CSSProperties={padding:10,border:'1px solid #cbd5e1',borderRadius:10,font:'inherit'}
const primary:React.CSSProperties={marginTop:12,padding:'10px 14px',border:0,borderRadius:10,background:'#05879A',color:'white',fontWeight:800}
const secondary:React.CSSProperties={padding:'9px 12px',border:'1px solid #cbd5e1',borderRadius:10,background:'white',fontWeight:700}
const caseButton:React.CSSProperties={width:'100%',display:'grid',gap:5,textAlign:'left',padding:12,border:'1px solid #e2e8f0',borderRadius:12,background:'white',marginTop:8}
const selectedCaseStyle:React.CSSProperties={background:'#ecfeff',borderColor:'#67e8f9'}
const historyRow:React.CSSProperties={display:'grid',gap:4,padding:'9px 0',borderBottom:'1px solid #e2e8f0'}
const err:React.CSSProperties={padding:12,background:'#fef2f2',color:'#991b1b',borderRadius:10}
const ok:React.CSSProperties={padding:12,background:'#ecfdf5',color:'#065f46',borderRadius:10}
