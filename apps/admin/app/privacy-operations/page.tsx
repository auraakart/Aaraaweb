'use client'

import { FormEvent,useCallback,useEffect,useState } from 'react'

type Session={accessToken:string;role:string;societyName?:string}
type Person={id:string;name:string;phone:string;relationship?:string}
type Context={subjects:Person[];assignees:Person[]}
type PrivacyCase={
  id:string;subjectUserId:string;subjectName?:string|null;subjectPhone?:string|null;
  requestType:'ACCESS'|'CORRECTION'|'ERASURE'|'OTHER';requestSummary:string;status:string;
  legalHold?:boolean;retentionReason?:string|null;retentionDecision?:'ALLOW'|'BLOCK'|null;
  retentionDecisionReason?:string|null;assignedToUserId?:string|null;assignedToName?:string|null;
  dueAt?:string|null;createdAt?:string
}
type History={id:string;eventType?:string;action?:string;status?:string;summary?:string;note?:string|null;createdAt?:string;occurredAt?:string;actorName?:string|null;actorUserId?:string}
type ErasurePlan={executable:boolean;blockers:string[];erase:string[];retain:string[]}

const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
const readRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','AUDITOR'])
const statuses=['OPEN','IN_REVIEW','WAITING','COMPLETED','REJECTED','CANCELLED']

function getSession():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw) as Session:null}catch{return null}}
async function api<T>(s:Session,path:string,init:RequestInit={}):Promise<T>{
  const r=await fetch(`${base}/api/v1${path}`,{...init,headers:{Accept:'application/json','Content-Type':'application/json',Authorization:`Bearer ${s.accessToken}`,...init.headers}})
  const text=await r.text();const body=text?JSON.parse(text):null
  if(!r.ok)throw new Error(Array.isArray(body?.message)?body.message.join(', '):body?.message??`Request failed (${r.status})`)
  return body as T
}
const fmt=(v?:string|null)=>v?new Date(v).toLocaleString('en-IN'):'—'
const labelText=(v:string)=>v.replaceAll('_',' ')

export default function PrivacyOperationsPage(){
  const session=typeof window==='undefined'?null:getSession()
  const allowed=!!session&&readRoles.has(session.role)
  const canManage=session?.role==='SUPER_ADMIN'
  const[cases,setCases]=useState<PrivacyCase[]>([]),[ctx,setCtx]=useState<Context>({subjects:[],assignees:[]}),[selectedId,setSelectedId]=useState(''),[history,setHistory]=useState<History[]>([]),[plan,setPlan]=useState<ErasurePlan|null>(null)
  const[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('')
  const[subjectUserId,setSubjectUserId]=useState(''),[requestType,setRequestType]=useState<PrivacyCase['requestType']>('ACCESS'),[summary,setSummary]=useState(''),[assignedToUserId,setAssignedToUserId]=useState(''),[dueAt,setDueAt]=useState('')
  const[status,setStatus]=useState('IN_REVIEW'),[statusNote,setStatusNote]=useState('')
  const[holdReason,setHoldReason]=useState(''),[retentionDecision,setRetentionDecision]=useState<'ALLOW'|'BLOCK'>('BLOCK'),[retentionReason,setRetentionReason]=useState('')
  const[erasureConfirmed,setErasureConfirmed]=useState(false)

  const selected=cases.find(x=>x.id===selectedId)??null

  const load=useCallback(async()=>{
    if(!session||!allowed)return
    setLoading(true);setError('')
    try{
      const[rows,context]=await Promise.all([api<PrivacyCase[]>(session,'/privacy/cases'),api<Context>(session,'/privacy/operator-context')])
      setCases(rows);setCtx(context)
      setSelectedId(current=>current&&rows.some(r=>r.id===current)?current:rows[0]?.id??'')
    }catch(e){setError(e instanceof Error?e.message:'Privacy operations could not be loaded')}finally{setLoading(false)}
  },[session?.accessToken,allowed])

  const loadHistory=useCallback(async(id:string)=>{
    if(!session||!id)return
    try{setHistory(await api<History[]>(session,`/privacy/cases/${id}/history`))}catch(e){setError(e instanceof Error?e.message:'Privacy case history could not be loaded')}
  },[session?.accessToken])

  useEffect(()=>{void load()},[load])
  useEffect(()=>{
    setPlan(null);setErasureConfirmed(false)
    if(selectedId)void loadHistory(selectedId)
  },[selectedId,loadHistory])
  useEffect(()=>{
    if(!selected)return
    setStatus(selected.status==='OPEN'?'IN_REVIEW':selected.status)
    setHoldReason(selected.retentionReason??'')
    setRetentionDecision(selected.retentionDecision??'BLOCK')
    setRetentionReason(selected.retentionDecisionReason??'')
  },[selectedId,selected?.status,selected?.retentionDecision])

  const run=async(task:()=>Promise<void>,message:string)=>{
    setBusy(true);setError('');setSuccess('')
    try{await task();setSuccess(message);await load();if(selectedId)await loadHistory(selectedId)}
    catch(e){setError(e instanceof Error?e.message:'Privacy operation failed')}
    finally{setBusy(false)}
  }

  const createCase=(e:FormEvent)=>{e.preventDefault();if(!session||!canManage)return;void run(async()=>{
    await api(session,'/privacy/cases',{method:'POST',body:JSON.stringify({
      subjectUserId,requestType,requestSummary:summary.trim(),
      assignedToUserId:assignedToUserId||undefined,
      dueAt:dueAt?new Date(dueAt).toISOString():undefined,
    })})
    setSubjectUserId('');setSummary('');setAssignedToUserId('');setDueAt('')
  },'Privacy request case created.')}

  const updateStatus=(e:FormEvent)=>{e.preventDefault();if(!session||!canManage||!selected)return;void run(
    ()=>api(session,`/privacy/cases/${selected.id}/status`,{method:'PATCH',body:JSON.stringify({status,note:statusNote.trim()||undefined})}).then(()=>undefined),
    'Privacy case status updated.'
  )}

  const updateHold=(e:FormEvent,next:boolean)=>{e.preventDefault();if(!session||!canManage||!selected)return
    if(next&&holdReason.trim().length<3){setError('Enter a retention/legal-hold reason of at least 3 characters.');return}
    void run(()=>api(session,`/privacy/cases/${selected.id}/legal-hold`,{method:'PATCH',body:JSON.stringify({legalHold:next,retentionReason:next?holdReason.trim():undefined})}).then(()=>undefined),next?'Legal hold applied.':'Legal hold released.')
  }

  const updateRetention=(e:FormEvent)=>{e.preventDefault();if(!session||!canManage||!selected||selected.requestType!=='ERASURE')return
    if(retentionReason.trim().length<3){setError('Enter a retention decision reason of at least 3 characters.');return}
    void run(()=>api(session,`/privacy/cases/${selected.id}/retention-review`,{method:'PATCH',body:JSON.stringify({decision:retentionDecision,reason:retentionReason.trim()})}).then(()=>undefined),'Retention review recorded.')
  }

  const previewPlan=async()=>{if(!session||!selected||selected.requestType!=='ERASURE')return;setBusy(true);setError('')
    try{setPlan(await api<ErasurePlan>(session,`/privacy/cases/${selected.id}/erasure-plan`))}
    catch(e){setError(e instanceof Error?e.message:'Erasure plan could not be loaded')}
    finally{setBusy(false)}
  }

  const executeErasure=()=>{if(!session||!canManage||!selected||selected.requestType!=='ERASURE'||!erasureConfirmed)return
    void run(()=>api(session,`/privacy/cases/${selected.id}/execute-erasure`,{method:'POST'}).then(()=>undefined),'Erasure/minimisation executed.')
  }

  if(!session||!allowed)return <main style={page}><h1>Privacy operations access required</h1><a href={session?.role==='AUDITOR'?'/audit':'/'}>Return</a></main>

  return <main style={page}>
    <header style={header}><div><small>{session.societyName??'Current society'} · {session.role.replaceAll('_',' ')}</small><h1>Privacy request operations</h1><p>{canManage?'Manage auditable access, correction and erasure requests with explicit retention controls.':'Read-only privacy case evidence.'}</p></div><a href={session.role==='AUDITOR'?'/audit':'/'}>← Back</a></header>
    {error&&<p style={err} role="alert">{error}</p>}{success&&<p style={ok} role="status">{success}</p>}

    {canManage&&<form onSubmit={createCase} style={panel}><h2>Create privacy case</h2><div style={grid}>
      <label style={label}>Subject<select style={input} value={subjectUserId} onChange={e=>setSubjectUserId(e.target.value)} required><option value="">Select resident/member</option>{ctx.subjects.map(p=><option key={p.id} value={p.id}>{p.name} · {p.phone}{p.relationship?` · ${p.relationship}`:''}</option>)}</select></label>
      <label style={label}>Request type<select style={input} value={requestType} onChange={e=>setRequestType(e.target.value as PrivacyCase['requestType'])}>{['ACCESS','CORRECTION','ERASURE','OTHER'].map(v=><option key={v}>{v}</option>)}</select></label>
      <label style={label}>Assignee<select style={input} value={assignedToUserId} onChange={e=>setAssignedToUserId(e.target.value)}><option value="">Unassigned</option>{ctx.assignees.map(p=><option key={p.id} value={p.id}>{p.name} · {p.phone}</option>)}</select></label>
      <label style={label}>Due at<input style={input} type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)}/></label>
    </div><label style={label}>Request summary<textarea style={input} value={summary} onChange={e=>setSummary(e.target.value)} required maxLength={2000}/></label><button style={primary} disabled={busy||!subjectUserId}>Create case</button></form>}

    <div style={layout}>
      <section style={panel}><h2>Cases</h2>{loading?<p>Loading…</p>:cases.length===0?<p>No privacy cases.</p>:cases.map(item=><button key={item.id} onClick={()=>setSelectedId(item.id)} style={{...caseButton,...(item.id===selectedId?selectedCaseStyle:{})}}><b>{item.requestType} · {item.status}</b><span>{item.requestSummary}</span><small>{item.subjectName??item.subjectUserId} {item.subjectPhone?`· ${item.subjectPhone}`:''}{item.legalHold?' · LEGAL HOLD':''}</small></button>)}</section>

      <section style={panel}>{!selected?<p>Select a case.</p>:<>
        <div style={header}><div><h2 style={{margin:0}}>{selected.requestType}</h2><p>{selected.requestSummary}</p></div><b>{selected.status}</b></div>
        <dl style={details}><dt>Subject</dt><dd>{selected.subjectName??selected.subjectUserId}{selected.subjectPhone?` · ${selected.subjectPhone}`:''}</dd><dt>Assignee</dt><dd>{selected.assignedToName??'Unassigned'}</dd><dt>Due</dt><dd>{fmt(selected.dueAt)}</dd><dt>Legal hold</dt><dd>{selected.legalHold?'Yes':'No'}{selected.retentionReason?` · ${selected.retentionReason}`:''}</dd>{selected.requestType==='ERASURE'&&<><dt>Retention review</dt><dd>{selected.retentionDecision??'PENDING'}{selected.retentionDecisionReason?` · ${selected.retentionDecisionReason}`:''}</dd></>}</dl>

        {canManage&&<div style={forms}>
          <form onSubmit={updateStatus} style={subpanel}><h3>Case decision</h3><label style={label}>Status<select style={input} value={status} onChange={e=>setStatus(e.target.value)}>{statuses.map(v=><option key={v}>{v}</option>)}</select></label><label style={label}>Decision/status note<textarea style={input} value={statusNote} onChange={e=>setStatusNote(e.target.value)} maxLength={1000}/></label><button style={primary} disabled={busy}>Update status</button></form>

          <form onSubmit={e=>updateHold(e,!selected.legalHold)} style={subpanel}><h3>{selected.legalHold?'Release legal hold':'Apply legal hold'}</h3>{!selected.legalHold&&<label style={label}>Retention/legal-hold reason<textarea style={input} value={holdReason} onChange={e=>setHoldReason(e.target.value)} maxLength={1000} required/></label>}<button style={secondary} disabled={busy}>{selected.legalHold?'Release hold':'Apply hold'}</button></form>

          {selected.requestType==='ERASURE'&&<form onSubmit={updateRetention} style={subpanel}><h3>Retention review</h3><label style={label}>Decision<select style={input} value={retentionDecision} onChange={e=>setRetentionDecision(e.target.value as 'ALLOW'|'BLOCK')}><option>BLOCK</option><option>ALLOW</option></select></label><label style={label}>Reason<textarea style={input} value={retentionReason} onChange={e=>setRetentionReason(e.target.value)} maxLength={1000} required/></label><button style={secondary} disabled={busy}>Record retention review</button></form>}
        </div>}

        {selected.requestType==='ERASURE'&&<section style={subpanel}><div style={header}><h3 style={{margin:0}}>Erasure/minimisation plan</h3><button type="button" style={secondary} disabled={busy} onClick={()=>void previewPlan()}>Preview plan</button></div>{plan?<><p><b>Executable: {plan.executable?'YES':'NO'}</b></p>{plan.blockers.length>0&&<div><b>Blockers</b><ul>{plan.blockers.map(x=><li key={x}>{x}</li>)}</ul></div>}<div style={grid}><div><b>Erase/minimise</b><ul>{plan.erase.map(x=><li key={x}>{x}</li>)}</ul></div><div><b>Retain</b><ul>{plan.retain.map(x=><li key={x}>{x}</li>)}</ul></div></div>{canManage&&<><label style={{...label,gridTemplateColumns:'auto 1fr',alignItems:'start'}}><input type="checkbox" checked={erasureConfirmed} onChange={e=>setErasureConfirmed(e.target.checked)}/><span>I confirm I reviewed this plan and understand removed runtime identifiers cannot be restored.</span></label><button type="button" style={danger} disabled={busy||!plan.executable||!erasureConfirmed||selected.retentionDecision!=='ALLOW'||!!selected.legalHold} onClick={executeErasure}>Execute erasure/minimisation</button></>}</>:<p>Preview the server-authoritative plan before any execution.</p>}</section>}

        <h3>History</h3>{history.length===0?<p>No history entries.</p>:history.map((entry,index)=><article key={entry.id??String(index)} style={historyRow}><b>{entry.eventType??entry.action??entry.status??'CASE_EVENT'}</b><small>{fmt(entry.createdAt??entry.occurredAt)}{entry.actorName?` · ${entry.actorName}`:''}</small>{(entry.summary??entry.note)&&<span>{entry.summary??entry.note}</span>}</article>)}
      </>}</section>
    </div>
  </main>
}

const page:React.CSSProperties={maxWidth:1180,margin:'0 auto',padding:'28px 22px 80px'}
const header:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap'}
const panel:React.CSSProperties={marginTop:18,padding:20,border:'1px solid #dbe7ea',borderRadius:16,background:'white'}
const subpanel:React.CSSProperties={padding:14,border:'1px solid #e2e8f0',borderRadius:12,background:'#f8fafc'}
const grid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:12}
const layout:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,360px),1fr))',gap:18}
const forms:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:12,marginTop:14}
const label:React.CSSProperties={display:'grid',gap:6,marginTop:10,fontWeight:700}
const input:React.CSSProperties={padding:10,border:'1px solid #cbd5e1',borderRadius:10,font:'inherit'}
const primary:React.CSSProperties={marginTop:12,padding:'10px 14px',border:0,borderRadius:10,background:'#05879A',color:'white',fontWeight:800}
const secondary:React.CSSProperties={marginTop:12,padding:'9px 12px',border:'1px solid #cbd5e1',borderRadius:10,background:'white',fontWeight:700}
const danger:React.CSSProperties={marginTop:12,padding:'10px 14px',border:0,borderRadius:10,background:'#991b1b',color:'white',fontWeight:800}
const caseButton:React.CSSProperties={width:'100%',display:'grid',gap:5,textAlign:'left',padding:12,border:'1px solid #e2e8f0',borderRadius:12,background:'white',marginTop:8}
const selectedCaseStyle:React.CSSProperties={background:'#ecfeff',borderColor:'#67e8f9'}
const details:React.CSSProperties={display:'grid',gridTemplateColumns:'130px 1fr',gap:'8px 12px'}
const historyRow:React.CSSProperties={display:'grid',gap:4,padding:'9px 0',borderBottom:'1px solid #e2e8f0'}
const err:React.CSSProperties={padding:12,background:'#fef2f2',color:'#991b1b',borderRadius:10}
const ok:React.CSSProperties={padding:12,background:'#ecfdf5',color:'#065f46',borderRadius:10}
