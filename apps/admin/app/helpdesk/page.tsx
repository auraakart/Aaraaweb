'use client'

import { FormEvent,useCallback,useEffect,useMemo,useRef,useState } from 'react'
import {
  ActionBar,
  DetailPanel,
  EmptyState,
  ErrorState,
  EvidenceGrid,
  FormField,
  PageHeader,
  PageShell,
  PrimaryButton,
  QueuePanel,
  ReadinessPanel,
  SecondaryButton,
  SelectField,
  StatusPill,
  Timeline,
} from '../../components/admin-ui'

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
type Readiness={ticketId:string;status:string;priority:string;assigned:boolean;computedSlaState:string;firstResponded:boolean;firstResponseDueAt?:string|null;resolutionDueAt?:string|null;escalationLevel:number;escalated:boolean;critical:boolean;blockers:string[];nextActions:string[];policy?:{firstResponseMinutes:number;resolutionMinutes:number;escalationAfterMinutes:number;automaticEscalationEnabled:boolean;escalationTargetUserId?:string|null;escalationTargetName?:string|null}|null;boundary:string}

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
const human=(v?:string|null)=>v?.replaceAll('_',' ')??'Not recorded'

export default function HelpdeskAdminPage(){
  const s=typeof window==='undefined'?null:session()
  const allowed=!!s&&allowedRoles.has(s.role)
  const[tickets,setTickets]=useState<Ticket[]>([]),[reviewers,setReviewers]=useState<Reviewer[]>([]),[selectedId,setSelectedId]=useState('')
  const[activities,setActivities]=useState<Activity[]>([]),[slaHistory,setSlaHistory]=useState<SlaEvent[]>([]),[readiness,setReadiness]=useState<Readiness|null>(null)
  const[queueLoading,setQueueLoading]=useState(false),[detailLoading,setDetailLoading]=useState(false),[mutationBusy,setMutationBusy]=useState(false)
  const[queueError,setQueueError]=useState(''),[detailError,setDetailError]=useState(''),[operationError,setOperationError]=useState(''),[success,setSuccess]=useState('')
  const[assignedToId,setAssignedToId]=useState(''),[status,setStatus]=useState('IN_PROGRESS'),[reasonCode,setReasonCode]=useState(''),[statusNote,setStatusNote]=useState('')
  const[comment,setComment]=useState(''),[internalNote,setInternalNote]=useState(''),[reopenNote,setReopenNote]=useState('')
  const[escalatedToId,setEscalatedToId]=useState(''),[escalationNote,setEscalationNote]=useState('')
  const detailRequest=useRef(0)

  const selected=useMemo(()=>tickets.find(t=>t.id===selectedId)??null,[tickets,selectedId])

  const load=useCallback(async()=>{if(!s||!allowed)return;setQueueLoading(true);setQueueError('')
    try{
      const[queue,ctx]=await Promise.all([
        api<Ticket[]>(s,'/helpdesk/sla/queue'),
        api<Reviewer[]>(s,'/helpdesk/review/context'),
      ])
      setTickets(queue);setReviewers(ctx)
      setSelectedId(current=>current&&queue.some(t=>t.id===current)?current:queue[0]?.id??'')
    }catch(e){setQueueError(e instanceof Error?e.message:'Helpdesk queue could not be loaded')}finally{setQueueLoading(false)}
  },[s?.accessToken,allowed])

  const loadDetail=useCallback(async(id:string)=>{if(!s||!id)return
    const requestId=++detailRequest.current
    setDetailLoading(true);setDetailError('');setActivities([]);setSlaHistory([]);setReadiness(null)
    try{
      const[a,h,r]=await Promise.all([
        api<Activity[]>(s,`/helpdesk/review/${id}/activities`),
        api<SlaEvent[]>(s,`/helpdesk/sla/${id}/history`),
        api<Readiness>(s,`/helpdesk/sla/${id}/readiness`),
      ])
      if(requestId!==detailRequest.current)return
      setActivities(a);setSlaHistory(h);setReadiness(r)
    }catch(e){
      if(requestId===detailRequest.current)setDetailError(e instanceof Error?e.message:'Helpdesk history could not be loaded')
    }finally{
      if(requestId===detailRequest.current)setDetailLoading(false)
    }
  },[s?.accessToken])

  useEffect(()=>{void load()},[load])
  useEffect(()=>{if(selectedId)void loadDetail(selectedId);else{detailRequest.current++;setActivities([]);setSlaHistory([]);setReadiness(null);setDetailError('');setDetailLoading(false)}},[selectedId,loadDetail])
  useEffect(()=>{if(!selected)return;setAssignedToId(selected.assignedToId??'');setStatus(selected.status==='OPEN'?'IN_PROGRESS':selected.status);setReasonCode('');setEscalatedToId(selected.escalatedToId??'');setStatusNote('');setComment('');setInternalNote('');setReopenNote('');setEscalationNote('');setOperationError('');setSuccess('')},[selectedId,selected?.status,selected?.assignedToId,selected?.escalatedToId])

  const run=async(task:()=>Promise<void>,message:string)=>{setMutationBusy(true);setOperationError('');setSuccess('')
    try{await task();setSuccess(message);await load();if(selectedId)await loadDetail(selectedId)}
    catch(e){setOperationError(e instanceof Error?e.message:'Helpdesk operation failed')}finally{setMutationBusy(false)}
  }

  const assign=(e:FormEvent)=>{e.preventDefault();if(!s||!selected)return;void run(()=>api(s,`/helpdesk/review/${selected.id}/assignment`,{method:'PATCH',body:JSON.stringify({assignedToId:assignedToId||null})}).then(()=>undefined),'Assignment updated.')}
  const updateStatus=(e:FormEvent)=>{e.preventDefault();if(!s||!selected)return
    if((status==='RESOLVED'||status==='CLOSED')&&!reasonCode){setOperationError('Select a resolution/closure code.');return}
    void run(()=>api(s,`/helpdesk/review/${selected.id}/status`,{method:'PATCH',body:JSON.stringify({status,note:statusNote.trim()||undefined,reasonCode:reasonCode||undefined})}).then(()=>undefined),'Status updated.')
  }
  const addComment=(e:FormEvent)=>{e.preventDefault();if(!s||!selected||!comment.trim())return;void run(()=>api(s,`/helpdesk/review/${selected.id}/comments`,{method:'POST',body:JSON.stringify({message:comment.trim()})}).then(()=>{setComment('')}),'Comment added.')}
  const addInternal=(e:FormEvent)=>{e.preventDefault();if(!s||!selected||!internalNote.trim())return;void run(()=>api(s,`/helpdesk/review/${selected.id}/internal-notes`,{method:'POST',body:JSON.stringify({message:internalNote.trim()})}).then(()=>{setInternalNote('')}),'Internal note added.')}
  const reopen=(e:FormEvent)=>{e.preventDefault();if(!s||!selected||!reopenNote.trim())return;void run(()=>api(s,`/helpdesk/review/${selected.id}/reopen`,{method:'POST',body:JSON.stringify({note:reopenNote.trim()})}).then(()=>{setReopenNote('')}),'Ticket reopened.')}
  const applyPolicy=()=>{if(!s||!selected)return;void run(()=>api(s,`/helpdesk/sla/${selected.id}/apply-policy`,{method:'POST'}).then(()=>undefined),'SLA policy applied.')}
  const evaluate=()=>{if(!s||!selected)return;void run(()=>api(s,`/helpdesk/sla/${selected.id}/evaluate`,{method:'POST'}).then(()=>undefined),'SLA state evaluated.')}
  const escalate=(e:FormEvent)=>{e.preventDefault();if(!s||!selected||!escalatedToId)return;void run(()=>api(s,`/helpdesk/sla/${selected.id}/escalate`,{method:'POST',body:JSON.stringify({escalatedToId,note:escalationNote.trim()||undefined})}).then(()=>{setEscalationNote('')}),'Ticket escalated.')}

  if(!s||!allowed)return <PageShell><PageHeader title="Helpdesk review access required" description="Your current Admin role does not include Helpdesk review access." actions={<a href="/">Return to Admin</a>}/></PageShell>

  const queueState=queueLoading?'loading':queueError?'error':tickets.length===0?'empty':'ready'
  const detailState=detailLoading?'loading':detailError?'error':!selected?'empty':'ready'

  return <PageShell>
    <PageHeader
      title="Helpdesk operations"
      context={`${s.societyName??'Current society'} · ${human(s.role)}`}
      description="Review resident tickets, manage ownership, lifecycle and SLA escalation with auditable evidence."
      actions={<a href="/">← Admin home</a>}
    />

    {operationError&&<ErrorState title="Helpdesk operation failed" description={operationError}/>}
    <ActionBar feedback={success} label="Page actions">
      <SecondaryButton disabled={queueLoading||mutationBusy} loading={queueLoading} loadingLabel="Refreshing…" onClick={()=>void load()}>Refresh queue</SecondaryButton>
    </ActionBar>

    <PageShell.Columns>
      <QueuePanel
        title="Prioritized queue"
        count={tickets.length}
        state={queueState}
        loadingLabel="Loading helpdesk queue…"
        error={<ErrorState title="Helpdesk queue unavailable" description={queueError} action={<SecondaryButton onClick={()=>void load()}>Retry queue</SecondaryButton>}/>}
        empty={<EmptyState title="No helpdesk tickets" description="There are no tickets in the current SLA queue."/>}
      >
        <div style={queueList}>
          {tickets.map(t=><button
            key={t.id}
            type="button"
            aria-pressed={t.id===selectedId}
            onClick={()=>setSelectedId(t.id)}
            style={{...ticketButton,...(t.id===selectedId?selectedStyle:{})}}
          >
            <span style={row}><StatusPill label={human(t.priority)} tone={t.priority==='URGENT'?'danger':t.priority==='HIGH'?'warning':'neutral'}/><StatusPill label={human(t.status)} tone={t.status==='RESOLVED'||t.status==='CLOSED'?'success':'info'}/></span>
            <strong>{t.title}</strong>
            <small>{t.buildingName??'Building'} · {t.unitNumber??'Unit'} · {t.createdByName??'Resident'}</small>
            <small>SLA: {human(t.computedSlaState??t.slaState??'UNTRACKED')}{t.assignedToName?` · ${t.assignedToName}`:' · Unassigned'}</small>
          </button>)}
        </div>
      </QueuePanel>

      <DetailPanel
        title={selected?.title??'Selected ticket'}
        state={detailState}
        loadingLabel="Loading selected ticket…"
        error={<ErrorState title="Ticket detail unavailable" description={detailError} action={selectedId?<SecondaryButton onClick={()=>void loadDetail(selectedId)}>Retry detail</SecondaryButton>:undefined}/>}
        empty={<EmptyState title="Select a ticket" description="Choose a helpdesk ticket from the prioritized queue to review it."/>}
        actions={selected?<StatusPill label={human(selected.computedSlaState??selected.slaState??'UNTRACKED')} tone={readiness?.critical?'danger':'info'}/>:undefined}
      >
        {selected&&<>
          <p>{selected.description}</p>
          <EvidenceGrid items={[
            {id:'property',label:'Property',value:`${selected.buildingName??'—'} · ${selected.unitNumber??'—'}`},
            {id:'resident',label:'Resident',value:selected.createdByName??'—'},
            {id:'priority',label:'Priority',value:human(selected.priority)},
            {id:'first-response-due',label:'First response due',value:fmt(selected.firstResponseDueAt)},
            {id:'resolution-due',label:'Resolution due',value:fmt(selected.resolutionDueAt)},
            {id:'escalation',label:'Escalation',value:`Level ${selected.escalationLevel??0}${selected.escalatedToName?` · ${selected.escalatedToName}`:''}`},
          ]}/>

          <ReadinessPanel
            title="Service-recovery readiness"
            status={{label:readiness?(readiness.blockers.length===0?'READY':'ACTION REQUIRED'):'Readiness unavailable',tone:readiness?.blockers.length===0?'success':'warning'}}
            state={readiness?'ready':'loading'}
            boundary={readiness?.boundary}
            blockers={readiness?.blockers.map(human)??[]}
            nextActions={readiness?.nextActions??[]}
            checks={readiness?<EvidenceGrid items={[
              {id:'ownership',label:'Ownership',value:readiness.assigned?'Assigned':'Unassigned'},
              {id:'first-response',label:'First response',value:readiness.firstResponded?'Responded':'Awaiting response'},
              {id:'sla-state',label:'SLA state',value:human(readiness.computedSlaState)},
              {id:'escalation-state',label:'Escalation',value:readiness.escalated?`Level ${readiness.escalationLevel}`:'Not escalated'},
              {id:'recovery-priority',label:'Recovery priority',value:readiness.critical?'Critical':'Normal'},
              {id:'response-resolution-target',label:'Response / resolution target',value:readiness.policy?`${readiness.policy.firstResponseMinutes}m / ${readiness.policy.resolutionMinutes}m`:'No active policy'},
            ]}/>:undefined}
          />

          <div style={formGrid}>
            <form onSubmit={assign} style={formCard}>
              <h3>Assignment</h3>
              <SelectField label="Assignee" value={assignedToId} onChange={e=>setAssignedToId(e.target.value)}>
                <option value="">Unassigned</option>{reviewers.map(r=><option key={r.id} value={r.id}>{r.name} · {r.phone}</option>)}
              </SelectField>
              <ActionBar feedback={success}><PrimaryButton type="submit" loading={mutationBusy}>Update assignment</PrimaryButton></ActionBar>
            </form>

            <form onSubmit={updateStatus} style={formCard}>
              <h3>Ticket lifecycle</h3>
              <SelectField label="Status" value={status} onChange={e=>{setStatus(e.target.value);setReasonCode('')}}>
                {statusOptions.map(v=><option key={v}>{v}</option>)}
              </SelectField>
              {status==='RESOLVED'&&<SelectField label="Resolution code" value={reasonCode} onChange={e=>setReasonCode(e.target.value)} required><option value="">Select</option>{resolutionCodes.map(v=><option key={v}>{v}</option>)}</SelectField>}
              {status==='CLOSED'&&<SelectField label="Closure code" value={reasonCode} onChange={e=>setReasonCode(e.target.value)} required><option value="">Select</option>{closureCodes.map(v=><option key={v}>{v}</option>)}</SelectField>}
              <FormField label="Status note" multiline value={statusNote} onChange={e=>setStatusNote(e.target.value)} maxLength={1000}/>
              <ActionBar feedback={success}><PrimaryButton type="submit" loading={mutationBusy}>Update status</PrimaryButton></ActionBar>
            </form>
          </div>

          <div style={formGrid}>
            <form onSubmit={addComment} style={formCard}>
              <h3>Resident-visible comment</h3>
              <FormField label="Comment" multiline value={comment} onChange={e=>setComment(e.target.value)} maxLength={1000}/>
              <ActionBar feedback={success}><SecondaryButton type="submit" loading={mutationBusy} disabled={!comment.trim()}>Add comment</SecondaryButton></ActionBar>
            </form>
            <form onSubmit={addInternal} style={formCard}>
              <h3>Internal note</h3>
              <FormField label="Internal note" multiline value={internalNote} onChange={e=>setInternalNote(e.target.value)} maxLength={1000}/>
              <ActionBar feedback={success}><SecondaryButton type="submit" loading={mutationBusy} disabled={!internalNote.trim()}>Add internal note</SecondaryButton></ActionBar>
            </form>
          </div>

          <section style={formCard} aria-labelledby="sla-controls-heading">
            <h3 id="sla-controls-heading">SLA controls</h3>
            <ActionBar feedback={success}>
              <SecondaryButton loading={mutationBusy} onClick={applyPolicy}>Apply policy</SecondaryButton>
              <SecondaryButton loading={mutationBusy} onClick={evaluate}>Evaluate SLA</SecondaryButton>
            </ActionBar>
            <form onSubmit={escalate} style={formGrid}>
              <SelectField label="Escalation target" value={escalatedToId} onChange={e=>setEscalatedToId(e.target.value)} required>
                <option value="">Select active member</option>{reviewers.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
              </SelectField>
              <FormField label="Escalation note" multiline value={escalationNote} onChange={e=>setEscalationNote(e.target.value)} maxLength={1000}/>
              <ActionBar feedback={success}><PrimaryButton type="submit" loading={mutationBusy} disabled={!escalatedToId}>Escalate breached ticket</PrimaryButton></ActionBar>
            </form>
          </section>

          {['RESOLVED','CLOSED'].includes(selected.status)&&<form onSubmit={reopen} style={formCard}>
            <h3>Reopen ticket</h3>
            <FormField label="Reopen note" multiline value={reopenNote} onChange={e=>setReopenNote(e.target.value)} required minLength={3} maxLength={1000}/>
            <ActionBar feedback={success}><SecondaryButton type="submit" loading={mutationBusy} disabled={reopenNote.trim().length<3}>Reopen</SecondaryButton></ActionBar>
          </form>}

          <section aria-labelledby="activity-history-heading"><h3 id="activity-history-heading">Activity history</h3>
            <Timeline label="Activity history" emptyLabel="No activity." events={activities.map(a=>({
              id:a.id,label:human(a.type),actor:a.actorName??'Recorded actor',dateTime:a.occurredAt,timeLabel:fmt(a.occurredAt),
              evidence:<>{a.message&&<div>{a.message}</div>}{(a.fromStatus||a.toStatus)&&<div>{a.fromStatus??''} → {a.toStatus??''}</div>}</>,
            }))}/>
          </section>

          <section aria-labelledby="sla-history-heading"><h3 id="sla-history-heading">SLA history</h3>
            <Timeline label="SLA history" emptyLabel="No SLA events." events={slaHistory.map(e=>({
              id:e.id,label:human(e.eventType),actor:e.actorName??'Recorded actor',dateTime:e.createdAt,timeLabel:fmt(e.createdAt),
              evidence:<>{e.note&&<div>{e.note}</div>}{(e.fromState||e.toState)&&<div>{e.fromState??''} → {e.toState??''}</div>}{e.escalatedToName&&<div>Escalated to {e.escalatedToName}</div>}</>,
            }))}/>
          </section>
        </>}
      </DetailPanel>
    </PageShell.Columns>
  </PageShell>
}

const queueList:React.CSSProperties={display:'grid',gap:8}
const ticketButton:React.CSSProperties={display:'grid',gap:6,width:'100%',textAlign:'left',padding:12,border:'1px solid var(--line, #d5e8eb)',borderRadius:12,background:'var(--surface, #fff)',color:'var(--ink, #17323a)',font:'inherit',cursor:'pointer'}
const selectedStyle:React.CSSProperties={background:'var(--neutral-soft, #eef6f7)',borderColor:'var(--brand, #05879a)',boxShadow:'inset 3px 0 0 var(--brand, #05879a)'}
const row:React.CSSProperties={display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}
const formGrid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,260px),1fr))',gap:16,alignItems:'start'}
const formCard:React.CSSProperties={display:'grid',gap:12,padding:16,border:'1px solid var(--line, #d5e8eb)',borderRadius:12,background:'var(--neutral-soft, #eef6f7)',minWidth:0}
