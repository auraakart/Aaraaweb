'use client'

import { FormEvent,useCallback,useEffect,useRef,useState } from 'react'
import {
  ActionBar,DetailPanel,EmptyState,ErrorState,EvidenceGrid,FormField,PageHeader,PageShell,
  PrimaryButton,QueuePanel,ReadinessPanel,SecondaryButton,SelectField,StatusPill,Timeline,DangerButton,
} from '../../components/admin-ui'
import { api, type Session } from '../../lib/admin-client'

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
type Readiness={caseId:string;requestType:string;status:string;assigned:boolean;dueAt?:string|null;overdue:boolean;blockers:string[];nextActions:string[];privacyProgramContext:{activeDataCategories:number;activeProcessors:number;openSecurityIncidents:number;grievanceContactActive:boolean};boundary:string;erasure?:{executable:boolean;blockers:string[]}}
type ProgramReadiness={status:'READY'|'ATTENTION'|'ACTION_REQUIRED';blockers:string[];nextActions:string[];metrics:{activeDataCategories:number;categoriesMissingLegalBasis:number;categoriesMissingRetention:number;activeProcessors:number;processorsMissingAgreementReference:number;overdueCases:number;openSecurityIncidents:number;grievanceContactActive:boolean};boundary:string}

const readRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','AUDITOR'])
const statuses=['OPEN','IN_REVIEW','WAITING','COMPLETED','REJECTED','CANCELLED']
function getSession():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw) as Session:null}catch{return null}}
const fmt=(v?:string|null)=>v?new Date(v).toLocaleString('en-IN'):'—'
const human=(v?:string|null)=>v?.replaceAll('_',' ')??'Not recorded'

export default function PrivacyOperationsPage(){
  const session=typeof window==='undefined'?null:getSession()
  const s=session
  const allowed=!!session&&readRoles.has(session.role)
  const canManage=s?.role==='SUPER_ADMIN'
  const[cases,setCases]=useState<PrivacyCase[]>([]),[ctx,setCtx]=useState<Context>({subjects:[],assignees:[]}),[selectedId,setSelectedId]=useState(''),[history,setHistory]=useState<History[]>([]),[plan,setPlan]=useState<ErasurePlan|null>(null),[readiness,setReadiness]=useState<Readiness|null>(null),[program,setProgram]=useState<ProgramReadiness|null>(null)
  const[queueLoading,setQueueLoading]=useState(true),[detailLoading,setDetailLoading]=useState(false),[busy,setBusy]=useState(false)
  const[queueError,setQueueError]=useState(''),[detailError,setDetailError]=useState(''),[operationError,setOperationError]=useState(''),[success,setSuccess]=useState('')
  const[subjectUserId,setSubjectUserId]=useState(''),[requestType,setRequestType]=useState<PrivacyCase['requestType']>('ACCESS'),[summary,setSummary]=useState(''),[assignedToUserId,setAssignedToUserId]=useState(''),[dueAt,setDueAt]=useState('')
  const[status,setStatus]=useState('IN_REVIEW'),[statusNote,setStatusNote]=useState('')
  const[holdReason,setHoldReason]=useState(''),[retentionDecision,setRetentionDecision]=useState<'ALLOW'|'BLOCK'>('BLOCK'),[retentionReason,setRetentionReason]=useState('')
  const[erasureConfirmed,setErasureConfirmed]=useState(false)
  const detailRequest=useRef(0)
  const selected=cases.find(x=>x.id===selectedId)??null

  const load=useCallback(async()=>{
    if(!session||!allowed)return
    setQueueLoading(true);setQueueError('')
    try{
      const[rows,context,programReadiness]=await Promise.all([
        api<PrivacyCase[]>('/privacy/cases',{},session),
        api<Context>('/privacy/operator-context',{},session),
        api<ProgramReadiness>('/privacy/program-readiness',{},session),
      ])
      setCases(rows);setCtx(context);setProgram(programReadiness)
      setSelectedId(current=>current&&rows.some(r=>r.id===current)?current:rows[0]?.id??'')
    }catch(e){setQueueError(e instanceof Error?e.message:'Privacy operations could not be loaded')}finally{setQueueLoading(false)}
  },[session?.accessToken,allowed])

  const loadDetail=useCallback(async(id:string)=>{
    if(!session||!id)return
    const requestId=++detailRequest.current
    setDetailLoading(true);setDetailError('');setHistory([]);setPlan(null);setReadiness(null);setErasureConfirmed(false)
    try{
      const[h,r]=await Promise.all([
        api<History[]>(`/privacy/cases/${id}/history`,{},session),
        api<Readiness>(`/privacy/cases/${id}/readiness`,{},session),
      ])
      if(requestId!==detailRequest.current)return
      setHistory(h);setReadiness(r)
    }catch(e){
      if(requestId===detailRequest.current)setDetailError(e instanceof Error?e.message:'Privacy case evidence could not be loaded')
    }finally{
      if(requestId===detailRequest.current)setDetailLoading(false)
    }
  },[session?.accessToken])

  useEffect(()=>{void load()},[load])
  useEffect(()=>{if(selectedId)void loadDetail(selectedId);else{detailRequest.current++;setHistory([]);setPlan(null);setReadiness(null);setDetailError('');setDetailLoading(false);setErasureConfirmed(false)}},[selectedId,loadDetail])
  useEffect(()=>{
    if(!selected)return
    setStatus(selected.status==='OPEN'?'IN_REVIEW':selected.status)
    setHoldReason(selected.retentionReason??'')
    setRetentionDecision(selected.retentionDecision??'BLOCK')
    setRetentionReason(selected.retentionDecisionReason??'')
    setStatusNote('');setOperationError('');setSuccess('');setPlan(null);setErasureConfirmed(false)
  },[selectedId,selected?.status,selected?.retentionDecision])

  const run=async(task:()=>Promise<void>,message:string)=>{
    setBusy(true);setOperationError('');setSuccess('')
    try{await task();setSuccess(message);await load();if(selectedId)await loadDetail(selectedId)}
    catch(e){setOperationError(e instanceof Error?e.message:'Privacy operation failed')}
    finally{setBusy(false)}
  }

  const createCase=(e:FormEvent)=>{e.preventDefault();if(!session||!canManage)return;void run(async()=>{
    await api('/privacy/cases',{method:'POST',body:JSON.stringify({
      subjectUserId,requestType,requestSummary:summary.trim(),assignedToUserId:assignedToUserId||undefined,
      dueAt:dueAt?new Date(dueAt).toISOString():undefined,
    })},session)
    setSubjectUserId('');setSummary('');setAssignedToUserId('');setDueAt('')
  },'Privacy request case created.')}

  const updateStatus=(e:FormEvent)=>{e.preventDefault();if(!session||!canManage||!selected)return;void run(
    ()=>api(`/privacy/cases/${selected.id}/status`,{method:'PATCH',body:JSON.stringify({status,note:statusNote.trim()||undefined})},session).then(()=>undefined),
    'Privacy case status updated.'
  )}
  const updateHold=(e:FormEvent,next:boolean)=>{e.preventDefault();if(!session||!canManage||!selected)return
    if(next&&holdReason.trim().length<3){setOperationError('Enter a retention/legal-hold reason of at least 3 characters.');return}
    void run(()=>api(`/privacy/cases/${selected.id}/legal-hold`,{method:'PATCH',body:JSON.stringify({legalHold:next,retentionReason:next?holdReason.trim():undefined})},session).then(()=>undefined),next?'Legal hold applied.':'Legal hold released.')
  }
  const updateRetention=(e:FormEvent)=>{e.preventDefault();if(!session||!canManage||!selected||selected.requestType!=='ERASURE')return
    if(retentionReason.trim().length<3){setOperationError('Enter a retention decision reason of at least 3 characters.');return}
    void run(()=>api(`/privacy/cases/${selected.id}/retention-review`,{method:'PATCH',body:JSON.stringify({decision:retentionDecision,reason:retentionReason.trim()})},session).then(()=>undefined),'Retention review recorded.')
  }
  const previewPlan=async()=>{if(!session||!selected||selected.requestType!=='ERASURE')return
    const selectedAtStart=selected.id
    setBusy(true);setOperationError('');setPlan(null);setErasureConfirmed(false)
    try{
      const next=await api<ErasurePlan>(`/privacy/cases/${selected.id}/erasure-plan`,{},session)
      if(selectedId===selectedAtStart)setPlan(next)
    }catch(e){setOperationError(e instanceof Error?e.message:'Erasure plan could not be loaded')}
    finally{setBusy(false)}
  }
  const executeErasure=()=>{if(!session||!canManage||!selected||selected.requestType!=='ERASURE'||!erasureConfirmed||!plan?.executable)return
    void run(()=>api(`/privacy/cases/${selected.id}/execute-erasure`,{method:'POST'},session).then(()=>undefined),'Erasure/minimisation executed.')
  }

  if(!session||!allowed)return <PageShell><PageHeader title="Privacy operations access required" actions={<a href={session?.role==='AUDITOR'?'/audit':'/'}>Return</a>}/></PageShell>

  const queueState=queueLoading?'loading':queueError?'error':cases.length===0?'empty':'ready'
  const detailState=detailLoading?'loading':detailError?'error':!selected?'empty':'ready'
  const readinessTone=readiness?.blockers.length===0?'success':'warning'

  return <PageShell>
    <PageHeader
      title="Privacy request operations"
      context={`${session.societyName??'Current society'} · ${human(session.role)}`}
      description={canManage?'Manage auditable access, correction and erasure requests with explicit retention controls.':'Read-only privacy case evidence.'}
      actions={<a href={session.role==='AUDITOR'?'/audit':'/'}>← Back</a>}
    />
    {operationError&&<ErrorState title="Privacy operation failed" description={operationError}/>}
    <ActionBar feedback={success} label="Privacy page actions">
      <SecondaryButton onClick={()=>void load()} loading={queueLoading} disabled={busy}>Refresh cases</SecondaryButton>
    </ActionBar>

    <ReadinessPanel
      title="Privacy program readiness"
      state={program?'ready':'loading'}
      status={program?{label:program.status.replaceAll('_',' '),tone:program.status==='READY'?'success':program.status==='ACTION_REQUIRED'?'warning':'info'}:undefined}
      boundary={program?.boundary}
      checks={program?<><EvidenceGrid items={[
        {id:'categories',label:'Active data categories',value:program.metrics.activeDataCategories},
        {id:'legal-basis',label:'Missing legal basis',value:program.metrics.categoriesMissingLegalBasis},
        {id:'retention',label:'Missing retention',value:program.metrics.categoriesMissingRetention},
        {id:'processors',label:'Processors missing agreement ref',value:program.metrics.processorsMissingAgreementReference},
        {id:'overdue',label:'Overdue privacy cases',value:program.metrics.overdueCases},
        {id:'incidents',label:'Open security incidents',value:program.metrics.openSecurityIncidents},
      ]}/>{program.nextActions.length>0&&<ul>{program.nextActions.map(action=><li key={action}>{action}</li>)}</ul>}</>:undefined}
    />

    {canManage&&<section style={formCard} aria-labelledby="create-privacy-case">
      <h2 id="create-privacy-case">Create privacy case</h2>
      <form onSubmit={createCase} style={formGrid}>
        <SelectField label="Subject" value={subjectUserId} onChange={e=>setSubjectUserId(e.target.value)} required>
          <option value="">Select resident/member</option>{ctx.subjects.map(p=><option key={p.id} value={p.id}>{p.name} · {p.phone}{p.relationship?` · ${p.relationship}`:''}</option>)}
        </SelectField>
        <SelectField label="Request type" value={requestType} onChange={e=>setRequestType(e.target.value as PrivacyCase['requestType'])}>
          {['ACCESS','CORRECTION','ERASURE','OTHER'].map(v=><option key={v}>{v}</option>)}
        </SelectField>
        <SelectField label="Assignee" value={assignedToUserId} onChange={e=>setAssignedToUserId(e.target.value)}>
          <option value="">Unassigned</option>{ctx.assignees.map(p=><option key={p.id} value={p.id}>{p.name} · {p.phone}</option>)}
        </SelectField>
        <FormField label="Due at" type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)}/>
        <FormField label="Request summary" multiline value={summary} onChange={e=>setSummary(e.target.value)} required maxLength={2000}/>
        <ActionBar feedback={success}><PrimaryButton type="submit" loading={busy} disabled={!subjectUserId}>Create case</PrimaryButton></ActionBar>
      </form>
    </section>}

    <PageShell.Columns>
      <QueuePanel
        title="Cases"
        count={cases.length}
        state={queueState}
        loadingLabel="Loading privacy cases…"
        error={<ErrorState title="Privacy cases unavailable" description={queueError} action={<SecondaryButton onClick={()=>void load()}>Retry cases</SecondaryButton>}/>}
        empty={<EmptyState title="No privacy cases" description="There are no privacy requests in this society workspace."/>}
      >
        <div style={queueList}>{cases.map(item=><button key={item.id} type="button" aria-pressed={item.id===selectedId} onClick={()=>setSelectedId(item.id)} style={{...caseButton,...(item.id===selectedId?selectedCaseStyle:{})}}>
          <span style={row}><StatusPill label={human(item.requestType)} tone={item.requestType==='ERASURE'?'warning':'info'}/><StatusPill label={human(item.status)} tone={item.status==='COMPLETED'?'success':item.status==='REJECTED'?'danger':'neutral'}/>{item.legalHold&&<StatusPill label="LEGAL HOLD" tone="warning"/>}</span>
          <strong>{item.requestSummary}</strong>
          <small>{item.subjectName??item.subjectUserId}{item.subjectPhone?` · ${item.subjectPhone}`:''}</small>
        </button>)}</div>
      </QueuePanel>

      <DetailPanel
        title={selected?human(selected.requestType):'Selected privacy case'}
        state={detailState}
        loadingLabel="Loading privacy case evidence…"
        error={<ErrorState title="Privacy case detail unavailable" description={detailError} action={selectedId?<SecondaryButton onClick={()=>void loadDetail(selectedId)}>Retry detail</SecondaryButton>:undefined}/>}
        empty={<EmptyState title="Select a privacy case" description="Choose a case from the queue to review evidence and permitted actions."/>}
        actions={selected?<StatusPill label={human(selected.status)} tone={selected.status==='COMPLETED'?'success':selected.status==='REJECTED'?'danger':'info'}/>:undefined}
      >
        {selected&&<>
          <p>{selected.requestSummary}</p>
          <EvidenceGrid items={[
            {id:'subject',label:'Subject',value:`${selected.subjectName??selected.subjectUserId}${selected.subjectPhone?` · ${selected.subjectPhone}`:''}`},
            {id:'assignee',label:'Assignee',value:selected.assignedToName??'Unassigned'},
            {id:'due',label:'Due',value:fmt(selected.dueAt)},
            {id:'legal-hold',label:'Legal hold',value:selected.legalHold?`Yes${selected.retentionReason?` · ${selected.retentionReason}`:''}`:'No'},
            ...(selected.requestType==='ERASURE'?[{id:'retention-review',label:'Retention review',value:`${selected.retentionDecision??'PENDING'}${selected.retentionDecisionReason?` · ${selected.retentionDecisionReason}`:''}`}]:[]),
          ]}/>

          <ReadinessPanel
            title="Case readiness"
            state={readiness?'ready':'loading'}
            status={{label:readiness?(readiness.blockers.length===0?'READY FOR REVIEW':'ACTION REQUIRED'):'Readiness unavailable',tone:readinessTone}}
            boundary={readiness?.boundary}
            blockers={readiness?.blockers.map(human)??[]}
            nextActions={readiness?.nextActions??[]}
            checks={readiness?<EvidenceGrid items={[
              {id:'case-ownership',label:'Case ownership',value:readiness.assigned?'Assigned':'Unassigned'},
              {id:'due-status',label:'Due status',value:readiness.overdue?'Overdue':readiness.dueAt?fmt(readiness.dueAt):'No due date'},
              {id:'active-data-categories',label:'Active data categories',value:readiness.privacyProgramContext.activeDataCategories},
              {id:'active-processors',label:'Active processors',value:readiness.privacyProgramContext.activeProcessors},
              {id:'open-privacy-incidents',label:'Open privacy incidents',value:readiness.privacyProgramContext.openSecurityIncidents},
              {id:'grievance-contact',label:'Grievance contact',value:readiness.privacyProgramContext.grievanceContactActive?'Configured':'Not active'},
              {id:'server-erasure-blockers',label:'Server erasure blockers',value:readiness.erasure?.blockers.length?readiness.erasure.blockers.map(human).join(', '):'None recorded'},
            ]}/>:undefined}
          />

          {canManage&&<div style={formGrid}>
            <form onSubmit={updateStatus} style={formCard}><h3>Case decision</h3>
              <SelectField label="Status" value={status} onChange={e=>setStatus(e.target.value)}>{statuses.map(v=><option key={v}>{v}</option>)}</SelectField>
              <FormField label="Decision/status note" multiline value={statusNote} onChange={e=>setStatusNote(e.target.value)} maxLength={1000}/>
              <ActionBar feedback={success}><PrimaryButton type="submit" loading={busy}>Update status</PrimaryButton></ActionBar>
            </form>

            <form onSubmit={e=>updateHold(e,!selected.legalHold)} style={formCard}><h3>{selected.legalHold?'Release legal hold':'Apply legal hold'}</h3>
              {!selected.legalHold&&<FormField label="Retention/legal-hold reason" multiline value={holdReason} onChange={e=>setHoldReason(e.target.value)} maxLength={1000} required/>}
              <ActionBar feedback={success}><SecondaryButton type="submit" loading={busy}>{selected.legalHold?'Release hold':'Apply hold'}</SecondaryButton></ActionBar>
            </form>

            {selected.requestType==='ERASURE'&&<form onSubmit={updateRetention} style={formCard}><h3>Retention review</h3>
              <SelectField label="Decision" value={retentionDecision} onChange={e=>setRetentionDecision(e.target.value as 'ALLOW'|'BLOCK')}><option>BLOCK</option><option>ALLOW</option></SelectField>
              <FormField label="Reason" multiline value={retentionReason} onChange={e=>setRetentionReason(e.target.value)} maxLength={1000} required/>
              <ActionBar feedback={success}><SecondaryButton type="submit" loading={busy}>Record retention review</SecondaryButton></ActionBar>
            </form>}
          </div>}

          {selected.requestType==='ERASURE'&&<section style={formCard} aria-labelledby="erasure-plan-heading"><h3 id="erasure-plan-heading">Erasure/minimisation plan</h3>
            <ActionBar feedback={success}><SecondaryButton loading={busy} onClick={()=>void previewPlan()}>Preview plan</SecondaryButton></ActionBar>
            {plan?<><EvidenceGrid items={[
              {id:'executable',label:'Executable',value:plan.executable?'YES':'NO'},
              {id:'plan-blockers',label:'Blockers',value:plan.blockers.length?plan.blockers.join(', '):'None'},
              {id:'erase',label:'Erase/minimise',value:plan.erase.length?plan.erase.join(', '):'None'},
              {id:'retain',label:'Retain',value:plan.retain.length?plan.retain.join(', '):'None'},
            ]}/>
            {canManage&&<>
              <label style={confirmRow}><input type="checkbox" checked={erasureConfirmed} onChange={e=>setErasureConfirmed(e.target.checked)}/><span>I confirm I reviewed this plan and understand removed runtime identifiers cannot be restored.</span></label>
              <ActionBar feedback={success}><DangerButton disabled={busy||!plan.executable||!erasureConfirmed||selected.retentionDecision!=='ALLOW'||!!selected.legalHold} loading={busy} onClick={executeErasure}>Execute erasure/minimisation</DangerButton></ActionBar>
            </>}</>:<EmptyState title="Preview required" description="Preview the server-authoritative plan before any execution."/>}
          </section>}

          <section aria-labelledby="privacy-history-heading"><h3 id="privacy-history-heading">History</h3>
            <Timeline label="Privacy case history" emptyLabel="No history entries." events={history.map((entry,index)=>({
              id:entry.id??String(index),label:human(entry.eventType??entry.action??entry.status??'CASE_EVENT'),actor:entry.actorName??undefined,
              dateTime:entry.createdAt??entry.occurredAt,timeLabel:fmt(entry.createdAt??entry.occurredAt),evidence:(entry.summary??entry.note)?<div>{entry.summary??entry.note}</div>:undefined,
            }))}/>
          </section>
        </>}
      </DetailPanel>
    </PageShell.Columns>
  </PageShell>
}

const queueList:React.CSSProperties={display:'grid',gap:8}
const row:React.CSSProperties={display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}
const caseButton:React.CSSProperties={width:'100%',display:'grid',gap:6,textAlign:'left',padding:12,border:'1px solid var(--line, #d5e8eb)',borderRadius:12,background:'var(--surface, #fff)',color:'var(--ink, #17323a)',font:'inherit',cursor:'pointer'}
const selectedCaseStyle:React.CSSProperties={background:'var(--neutral-soft, #eef6f7)',borderColor:'var(--brand, #05879a)',boxShadow:'inset 3px 0 0 var(--brand, #05879a)'}
const formGrid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,260px),1fr))',gap:16,alignItems:'start'}
const formCard:React.CSSProperties={display:'grid',gap:12,padding:16,border:'1px solid var(--line, #d5e8eb)',borderRadius:12,background:'var(--neutral-soft, #eef6f7)',minWidth:0}
const confirmRow:React.CSSProperties={display:'grid',gridTemplateColumns:'auto 1fr',gap:10,alignItems:'start'}
