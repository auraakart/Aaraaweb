'use client'

import { FormEvent,useCallback,useEffect,useMemo,useState } from 'react'

type Session={accessToken:string;role:string;societyName?:string}
type Reviewer={id:string;name:string;phone:string}
type Ticket={
  id:string;title:string;description:string;category?:string|null;priority:string;status:string;
  unitNumber?:string;buildingName?:string;createdByName?:string;assignedToId?:string|null;assignedToName?:string|null;
  slaState?:string;computedSlaState?:string;firstResponseDueAt?:string|null;resolutionDueAt?:string|null;
  escalationLevel?:number;escalatedToId?:string|null;escalatedToName?:string|null;resolutionCode?:string|null;closureCode?:string|null
}
type Activity={id:string;type:string;message?:string|null;fromStatus?:string|null;toStatus?:string|null;actorName?:string|null;occurredAt:string}
type SlaEvent={id:string;eventType:string;fromState?:string|null;toState?:string|null;note?:string|null;actorName?:string|null;escalatedToName?:string|null;createdAt:string}

const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
const allowedRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER'])
const statusOptions=['OPEN','IN_PROGRESS','RESOLVED','CLOSED']
const resolutionCodes=['FIXED','WORKAROUND','DUPLICATE','NOT_REPRODUCIBLE','REQUEST_WITHDRAWN','OTHER']
const closureCodes=['RESOLVED_CONFIRMED','RESIDENT_CONFIRMED','DUPLICATE','INVALID_REQUEST','REQUEST_WITHDRAWN','OTHER']

function session():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw):null}catch{return null}}
async function api<T>(s:Session,path:string,init:RequestInit={}):Promise<T>{
  const r=await fetch(`${base}/api/v1${path}`,{...init,headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.accessToken}`,...init.headers}})
  const text=await r.text(),body=text?JSON.parse(text):null
  if(!r.ok)throw new Error(Array.isArray(body?.message)?body.message.join(', '):body?.message??`Request failed (${r.status})`)
  return body as T
}
const fmt=(v?:string|null)=>v?new Date(v).toLocaleString('en-IN'):'—'

export default function HelpdeskAdminPage(){
  const s=typeof window==='undefined'?null:session()
  const allowed=!!s&&allowedRoles.has(s.role)
  const[tickets,setTickets]=useState<Ticket[]>([]),[reviewers,setReviewers]=useState<Reviewer[]>([]),[selectedId,setSelectedId]=useState('')
  const[activities,setActivities]=useState<Activity[]>([]),[slaHistory,setSlaHistory]=useState<SlaEvent[]>([])
  const[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('')
  const[assignedToId,setAssignedToId]=useState(''),[status,setStatus]=useState('IN_PROGRESS'),[reasonCode,setReasonCode]=useState(''),[statusNote,setStatusNote]=useState('')
  const[comment,setComment]=useState(''),[internalNote,setInternalNote]=useState(''),[reopenNote,setReopenNote]=useState('')
  const[escalatedToId,setEscalatedToId]=useState(''),[escalationNote,setEscalationNote]=useState('')

  const selected=useMemo(()=>tickets.find(t=>t.id===selectedId)??null,[tickets,selectedId])

  const load=useCallback(async()=>{if(!s||!allowed)return;setBusy(true);setError('')
    try{
      const[queue,ctx]=await Promise.all([
        api<Ticket[]>(s,'/helpdesk/sla/queue'),
        api<Reviewer[]>(s,'/helpdesk/review/context'),
      ])
      setTickets(queue);setReviewers(ctx)
      setSelectedId(current=>current&&queue.some(t=>t.id===current)?current:queue[0]?.id??'')
    }catch(e){setError(e instanceof Error?e.message:'Helpdesk queue could not be loaded')}finally{setBusy(false)}
  },[s?.accessToken,allowed])

  const loadDetail=useCallback(async(id:string)=>{if(!s||!id)return
    try{
      const[a,h]=await Promise.all([
        api<Activity[]>(s,`/helpdesk/review/${id}/activities`),
        api<SlaEvent[]>(s,`/helpdesk/sla/${id}/history`),
      ])
      setActivities(a);setSlaHistory(h)
    }catch(e){setError(e instanceof Error?e.message:'Helpdesk history could not be loaded')}
  },[s?.accessToken])

  useEffect(()=>{void load()},[load])
  useEffect(()=>{if(selectedId)void loadDetail(selectedId)},[selectedId,loadDetail])
  useEffect(()=>{if(!selected)return;setAssignedToId(selected.assignedToId??'');setStatus(selected.status==='OPEN'?'IN_PROGRESS':selected.status);setReasonCode('');setEscalatedToId(selected.escalatedToId??'')},[selectedId,selected?.status,selected?.assignedToId,selected?.escalatedToId])

  const run=async(task:()=>Promise<void>,message:string)=>{setBusy(true);setError('');setSuccess('')
    try{await task();setSuccess(message);await load();if(selectedId)await loadDetail(selectedId)}
    catch(e){setError(e instanceof Error?e.message:'Helpdesk operation failed')}finally{setBusy(false)}
  }

  const assign=(e:FormEvent)=>{e.preventDefault();if(!s||!selected)return;void run(()=>api(s,`/helpdesk/review/${selected.id}/assignment`,{method:'PATCH',body:JSON.stringify({assignedToId:assignedToId||null})}).then(()=>undefined),'Assignment updated.')}
  const updateStatus=(e:FormEvent)=>{e.preventDefault();if(!s||!selected)return
    if((status==='RESOLVED'||status==='CLOSED')&&!reasonCode){setError('Select a resolution/closure code.');return}
    void run(()=>api(s,`/helpdesk/review/${selected.id}/status`,{method:'PATCH',body:JSON.stringify({status,note:statusNote.trim()||undefined,reasonCode:reasonCode||undefined})}).then(()=>undefined),'Status updated.')
  }
  const addComment=(e:FormEvent)=>{e.preventDefault();if(!s||!selected||!comment.trim())return;void run(()=>api(s,`/helpdesk/review/${selected.id}/comments`,{method:'POST',body:JSON.stringify({message:comment.trim()})}).then(()=>{setComment('')}),'Comment added.')}
  const addInternal=(e:FormEvent)=>{e.preventDefault();if(!s||!selected||!internalNote.trim())return;void run(()=>api(s,`/helpdesk/review/${selected.id}/internal-notes`,{method:'POST',body:JSON.stringify({message:internalNote.trim()})}).then(()=>{setInternalNote('')}),'Internal note added.')}
  const reopen=(e:FormEvent)=>{e.preventDefault();if(!s||!selected||!reopenNote.trim())return;void run(()=>api(s,`/helpdesk/review/${selected.id}/reopen`,{method:'POST',body:JSON.stringify({note:reopenNote.trim()})}).then(()=>{setReopenNote('')}),'Ticket reopened.')}
  const applyPolicy=()=>{if(!s||!selected)return;void run(()=>api(s,`/helpdesk/sla/${selected.id}/apply-policy`,{method:'POST'}).then(()=>undefined),'SLA policy applied.')}
  const evaluate=()=>{if(!s||!selected)return;void run(()=>api(s,`/helpdesk/sla/${selected.id}/evaluate`,{method:'POST'}).then(()=>undefined),'SLA state evaluated.')}
  const escalate=(e:FormEvent)=>{e.preventDefault();if(!s||!selected||!escalatedToId)return;void run(()=>api(s,`/helpdesk/sla/${selected.id}/escalate`,{method:'POST',body:JSON.stringify({escalatedToId,note:escalationNote.trim()||undefined})}).then(()=>{setEscalationNote('')}),'Ticket escalated.')}

  if(!s||!allowed)return <main style={page}><h1>Helpdesk review access required</h1><a href="/">Return to Admin</a></main>

  return <main style={page}>
    <header style={header}><div><small>{s.societyName??'Current society'} · {s.role.replaceAll('_',' ')}</small><h1>Helpdesk operations</h1><p>Review resident tickets, manage ownership, lifecycle and SLA escalation with auditable evidence.</p></div><a href="/">← Admin home</a></header>
    {error&&<p style={err} role="alert">{error}</p>}{success&&<p style={ok} role="status">{success}</p>}
    <div style={layout}>
      <section style={panel}><div style={header}><h2 style={{margin:0}}>Prioritized queue</h2><button style={secondary} disabled={busy} onClick={()=>void load()}>Refresh</button></div>
        {tickets.length===0?<p>No helpdesk tickets.</p>:tickets.map(t=><button key={t.id} onClick={()=>setSelectedId(t.id)} style={{...ticketButton,...(t.id===selectedId?selectedStyle:{})}}>
          <b>{t.priority} · {t.status}</b><span>{t.title}</span><small>{t.buildingName??'Building'} · {t.unitNumber??'Unit'} · {t.createdByName??'Resident'}</small>
          <small>SLA: {t.computedSlaState??t.slaState??'UNTRACKED'}{t.assignedToName?` · ${t.assignedToName}`:' · Unassigned'}</small>
        </button>)}
      </section>

      <section style={panel}>{!selected?<p>Select a ticket.</p>:<>
        <div style={header}><div><h2 style={{margin:0}}>{selected.title}</h2><p>{selected.description}</p></div><strong>{selected.computedSlaState??selected.slaState??'UNTRACKED'}</strong></div>
        <dl style={details}><dt>Property</dt><dd>{selected.buildingName??'—'} · {selected.unitNumber??'—'}</dd><dt>Resident</dt><dd>{selected.createdByName??'—'}</dd><dt>Priority</dt><dd>{selected.priority}</dd><dt>First response due</dt><dd>{fmt(selected.firstResponseDueAt)}</dd><dt>Resolution due</dt><dd>{fmt(selected.resolutionDueAt)}</dd><dt>Escalation</dt><dd>Level {selected.escalationLevel??0}{selected.escalatedToName?` · ${selected.escalatedToName}`:''}</dd></dl>

        <div style={grid}>
          <form onSubmit={assign} style={subpanel}><h3>Assignment</h3><label style={label}>Assignee<select style={input} value={assignedToId} onChange={e=>setAssignedToId(e.target.value)}><option value="">Unassigned</option>{reviewers.map(r=><option key={r.id} value={r.id}>{r.name} · {r.phone}</option>)}</select></label><button style={primary} disabled={busy}>Update assignment</button></form>
          <form onSubmit={updateStatus} style={subpanel}><h3>Ticket lifecycle</h3><label style={label}>Status<select style={input} value={status} onChange={e=>{setStatus(e.target.value);setReasonCode('')}}>{statusOptions.map(v=><option key={v}>{v}</option>)}</select></label>{status==='RESOLVED'&&<label style={label}>Resolution code<select style={input} value={reasonCode} onChange={e=>setReasonCode(e.target.value)} required><option value="">Select</option>{resolutionCodes.map(v=><option key={v}>{v}</option>)}</select></label>}{status==='CLOSED'&&<label style={label}>Closure code<select style={input} value={reasonCode} onChange={e=>setReasonCode(e.target.value)} required><option value="">Select</option>{closureCodes.map(v=><option key={v}>{v}</option>)}</select></label>}<label style={label}>Status note<textarea style={input} value={statusNote} onChange={e=>setStatusNote(e.target.value)} maxLength={1000}/></label><button style={primary} disabled={busy}>Update status</button></form>
        </div>

        <div style={grid}>
          <form onSubmit={addComment} style={subpanel}><h3>Resident-visible comment</h3><textarea style={input} value={comment} onChange={e=>setComment(e.target.value)} maxLength={1000}/><button style={secondary} disabled={busy||!comment.trim()}>Add comment</button></form>
          <form onSubmit={addInternal} style={subpanel}><h3>Internal note</h3><textarea style={input} value={internalNote} onChange={e=>setInternalNote(e.target.value)} maxLength={1000}/><button style={secondary} disabled={busy||!internalNote.trim()}>Add internal note</button></form>
        </div>

        <section style={subpanel}><div style={header}><h3 style={{margin:0}}>SLA controls</h3><div><button style={secondary} disabled={busy} onClick={applyPolicy}>Apply policy</button> <button style={secondary} disabled={busy} onClick={evaluate}>Evaluate SLA</button></div></div>
          <form onSubmit={escalate} style={grid}><label style={label}>Escalation target<select style={input} value={escalatedToId} onChange={e=>setEscalatedToId(e.target.value)} required><option value="">Select active member</option>{reviewers.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label style={label}>Escalation note<textarea style={input} value={escalationNote} onChange={e=>setEscalationNote(e.target.value)} maxLength={1000}/></label><button style={primary} disabled={busy||!escalatedToId}>Escalate breached ticket</button></form>
        </section>

        {['RESOLVED','CLOSED'].includes(selected.status)&&<form onSubmit={reopen} style={subpanel}><h3>Reopen ticket</h3><textarea style={input} value={reopenNote} onChange={e=>setReopenNote(e.target.value)} required minLength={3} maxLength={1000}/><button style={secondary} disabled={busy||reopenNote.trim().length<3}>Reopen</button></form>}

        <h3>Activity history</h3>{activities.length===0?<p>No activity.</p>:activities.map(a=><article key={a.id} style={historyRow}><b>{a.type.replaceAll('_',' ')}</b><small>{a.actorName??'Recorded actor'} · {fmt(a.occurredAt)}</small>{a.message&&<span>{a.message}</span>}{(a.fromStatus||a.toStatus)&&<span>{a.fromStatus??''} → {a.toStatus??''}</span>}</article>)}
        <h3>SLA history</h3>{slaHistory.length===0?<p>No SLA events.</p>:slaHistory.map(e=><article key={e.id} style={historyRow}><b>{e.eventType.replaceAll('_',' ')}</b><small>{e.actorName??'Recorded actor'} · {fmt(e.createdAt)}</small>{e.note&&<span>{e.note}</span>}{(e.fromState||e.toState)&&<span>{e.fromState??''} → {e.toState??''}</span>}{e.escalatedToName&&<span>Escalated to {e.escalatedToName}</span>}</article>)}
      </>}</section>
    </div>
  </main>
}

const page:React.CSSProperties={maxWidth:1220,margin:'0 auto',padding:'28px 22px 80px'}
const header:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:14,alignItems:'center',flexWrap:'wrap'}
const layout:React.CSSProperties={display:'grid',gridTemplateColumns:'minmax(320px,.85fr) minmax(420px,1.6fr)',gap:18,alignItems:'start'}
const panel:React.CSSProperties={marginTop:18,padding:18,border:'1px solid #dbe7ea',borderRadius:16,background:'white'}
const subpanel:React.CSSProperties={marginTop:14,padding:14,border:'1px solid #e2e8f0',borderRadius:12,background:'#f8fafc'}
const grid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:12}
const label:React.CSSProperties={display:'grid',gap:6,fontWeight:700}
const input:React.CSSProperties={width:'100%',boxSizing:'border-box',padding:10,border:'1px solid #cbd5e1',borderRadius:9,font:'inherit'}
const primary:React.CSSProperties={marginTop:10,padding:'10px 14px',border:0,borderRadius:9,background:'#0f766e',color:'white',fontWeight:800}
const secondary:React.CSSProperties={padding:'9px 12px',border:'1px solid #cbd5e1',borderRadius:9,background:'white',fontWeight:700}
const ticketButton:React.CSSProperties={display:'grid',gap:5,width:'100%',textAlign:'left',padding:12,marginTop:8,border:'1px solid #e2e8f0',borderRadius:12,background:'white'}
const selectedStyle:React.CSSProperties={background:'#f0fdfa',borderColor:'#5eead4'}
const details:React.CSSProperties={display:'grid',gridTemplateColumns:'150px 1fr',gap:'8px 12px'}
const historyRow:React.CSSProperties={display:'grid',gap:4,padding:'9px 0',borderBottom:'1px solid #e2e8f0'}
const err:React.CSSProperties={padding:12,background:'#fef2f2',color:'#991b1b',borderRadius:10}
const ok:React.CSSProperties={padding:12,background:'#ecfdf5',color:'#065f46',borderRadius:10}
