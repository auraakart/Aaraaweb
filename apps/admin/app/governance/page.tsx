'use client'

import { FormEvent,useCallback,useEffect,useMemo,useRef,useState } from 'react'
import { adminApi, getAdminSession, type AdminSession } from '../../lib/aaraagate-api'
import {
  ActionBar,DetailPanel,EmptyState,ErrorState,EvidenceGrid,FormField,PageHeader,PageShell,
  PrimaryButton,QueuePanel,SecondaryButton,SelectField,StatusPill,Timeline,
} from '../../components/admin-ui'

type Tenure={id:string;userId:string;userName?:string;userPhone?:string;roleName:string;effectiveFrom:string;effectiveTo?:string|null;handoverNotes?:string|null}
type Meeting={id:string;meetingType:'AGM'|'SGM'|'COMMITTEE'|'BUSINESS';status:'SCHEDULED'|'HELD'|'CANCELLED';title:string;scheduledAt:string;heldAt?:string|null;location?:string|null;quorumRequired?:number|null;quorumPresent?:number|null;quorumRuleReference?:string|null;byeLawReference?:string|null}
type Agenda={id:string;ordinal:number;title:string;description?:string|null}
type Resolution={id:string;agendaItemId?:string|null;title:string;resolutionText:string;status:'PROPOSED'|'PASSED'|'REJECTED'|'WITHDRAWN';approvalRequired?:number|null;approvalRecorded?:number|null;approvalRuleReference?:string|null;byeLawReference?:string|null}
type ActionItem={id:string;resolutionId?:string|null;title:string;description?:string|null;ownerUserId?:string|null;dueAt?:string|null;status:'OPEN'|'IN_PROGRESS'|'COMPLETED'|'CANCELLED';completedAt?:string|null}
type Evidence={id:string;eventType:string;summary:string;createdAt:string}
type MeetingDetail=Meeting&{minutesSummary?:string|null;agenda:Agenda[];resolutions:Resolution[];actions:ActionItem[];evidence:Evidence[]}

const readRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER'])
const manageRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER'])
const fmt=(v?:string|null)=>v?new Date(v).toLocaleString('en-IN'):'—'
const iso=(v:string)=>new Date(v).toISOString()
const human=(v:string)=>v.replaceAll('_',' ')

export default function GovernancePage(){
  const s=typeof window==='undefined'?null:getAdminSession(),canRead=!!s&&readRoles.has(s.role),canManage=!!s&&manageRoles.has(s.role)
  const[tenures,setTenures]=useState<Tenure[]>([]),[meetings,setMeetings]=useState<Meeting[]>([]),[selected,setSelected]=useState<MeetingDetail|null>(null)
  const[loading,setLoading]=useState(true),[detailLoading,setDetailLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[detailError,setDetailError]=useState(''),[success,setSuccess]=useState('')
  const[userId,setUserId]=useState(''),[roleName,setRoleName]=useState(''),[tenureFrom,setTenureFrom]=useState(''),[tenureTo,setTenureTo]=useState('')
  const[meetingType,setMeetingType]=useState<Meeting['meetingType']>('COMMITTEE'),[meetingTitle,setMeetingTitle]=useState(''),[scheduledAt,setScheduledAt]=useState(''),[location,setLocation]=useState(''),[quorumRequired,setQuorumRequired]=useState(''),[ruleRef,setRuleRef]=useState(''),[byeLawRef,setByeLawRef]=useState('')
  const[endingTenureId,setEndingTenureId]=useState(''),[tenureEndAt,setTenureEndAt]=useState(''),[handoverNotes,setHandoverNotes]=useState('')
  const[agendaOrdinal,setAgendaOrdinal]=useState(''),[agendaTitle,setAgendaTitle]=useState(''),[agendaDescription,setAgendaDescription]=useState('')
  const[resolutionTitle,setResolutionTitle]=useState(''),[resolutionText,setResolutionText]=useState(''),[resolutionStatus,setResolutionStatus]=useState<Resolution['status']>('PROPOSED'),[approvalRequired,setApprovalRequired]=useState(''),[approvalRecorded,setApprovalRecorded]=useState(''),[resolutionRuleRef,setResolutionRuleRef]=useState(''),[resolutionByeLawRef,setResolutionByeLawRef]=useState('')
  const[actionTitle,setActionTitle]=useState(''),[actionDescription,setActionDescription]=useState(''),[actionOwnerUserId,setActionOwnerUserId]=useState(''),[actionDueAt,setActionDueAt]=useState('')
  const[actionFollowId,setActionFollowId]=useState(''),[actionFollowStatus,setActionFollowStatus]=useState<ActionItem['status']>('OPEN'),[actionFollowOwner,setActionFollowOwner]=useState(''),[actionFollowDue,setActionFollowDue]=useState('')
  const[outcomeStatus,setOutcomeStatus]=useState<Meeting['status']>('SCHEDULED'),[outcomeHeldAt,setOutcomeHeldAt]=useState(''),[outcomeQuorumPresent,setOutcomeQuorumPresent]=useState(''),[outcomeMinutes,setOutcomeMinutes]=useState(''),[outcomeRuleRef,setOutcomeRuleRef]=useState(''),[outcomeByeLawRef,setOutcomeByeLawRef]=useState('')
  const detailRequest=useRef(0)
  const activeTenures=useMemo(()=>tenures.filter(t=>!t.effectiveTo||new Date(t.effectiveTo).getTime()>=Date.now()),[tenures])

  const load=useCallback(async()=>{
    if(!s||!canRead)return
    setLoading(true);setError('')
    try{
      const[t,m]=await Promise.all([adminApi<Tenure[]>(s,'/governance/committee'),adminApi<Meeting[]>(s,'/governance/meetings')])
      setTenures(t);setMeetings(m)
    }catch(e){setError(e instanceof Error?e.message:'Could not load governance workspace')}
    finally{setLoading(false)}
  },[s?.accessToken,canRead])

  useEffect(()=>{void load()},[load])

  async function inspect(id:string){
    if(!s)return
    const requestId=++detailRequest.current
    setDetailLoading(true);setDetailError('')
    try{
      const detail=await adminApi<MeetingDetail>(s,`/governance/meetings/${id}`)
      if(requestId===detailRequest.current)setSelected(detail)
    }catch(e){
      if(requestId===detailRequest.current)setDetailError(e instanceof Error?e.message:'Could not load meeting')
    }finally{
      if(requestId===detailRequest.current)setDetailLoading(false)
    }
  }

  async function addTenure(e:FormEvent){
    e.preventDefault();if(!s||!canManage)return
    setBusy(true);setError('');setSuccess('')
    try{
      await adminApi(s,'/governance/committee/tenures',{method:'POST',body:JSON.stringify({userId:userId.trim(),roleName:roleName.trim(),effectiveFrom:iso(tenureFrom),effectiveTo:tenureTo?iso(tenureTo):undefined})})
      setUserId('');setRoleName('');setTenureFrom('');setTenureTo('');setSuccess('Committee tenure added.');await load()
    }catch(e){setError(e instanceof Error?e.message:'Could not add committee tenure')}
    finally{setBusy(false)}
  }

  async function endTenure(e:FormEvent){
    e.preventDefault();if(!s||!canManage||!endingTenureId||!tenureEndAt)return
    setBusy(true);setError('');setSuccess('')
    try{
      await adminApi(s,`/governance/committee/tenures/${endingTenureId}/end`,{method:'POST',body:JSON.stringify({effectiveTo:iso(tenureEndAt),handoverNotes:handoverNotes.trim()||undefined})})
      setEndingTenureId('');setTenureEndAt('');setHandoverNotes('');setSuccess('Committee tenure ended with handover evidence.');await load()
    }catch(e){setError(e instanceof Error?e.message:'Could not end tenure')}
    finally{setBusy(false)}
  }

  async function createMeeting(e:FormEvent){
    e.preventDefault();if(!s||!canManage)return
    setBusy(true);setError('');setSuccess('')
    try{
      const created=await adminApi<MeetingDetail>(s,'/governance/meetings',{method:'POST',body:JSON.stringify({meetingType,title:meetingTitle.trim(),scheduledAt:iso(scheduledAt),location:location.trim()||undefined,quorumRequired:quorumRequired?Number(quorumRequired):undefined,quorumRuleReference:ruleRef.trim()||undefined,byeLawReference:byeLawRef.trim()||undefined})})
      setMeetingTitle('');setScheduledAt('');setLocation('');setQuorumRequired('');setRuleRef('');setByeLawRef('');setSelected(created);setSuccess('Governance meeting created.');await load()
    }catch(e){setError(e instanceof Error?e.message:'Could not create meeting')}
    finally{setBusy(false)}
  }

  async function addAgenda(e:FormEvent){
    e.preventDefault();if(!s||!selected||!canManage||!agendaTitle.trim())return
    const ordinal=Number(agendaOrdinal||selected.agenda.length+1)
    if(!Number.isInteger(ordinal)||ordinal<1){setError('Agenda order must be a positive whole number');return}
    const id=selected.id;setBusy(true);setError('');setSuccess('')
    try{await adminApi(s,`/governance/meetings/${id}/agenda`,{method:'POST',body:JSON.stringify({ordinal,title:agendaTitle.trim(),description:agendaDescription.trim()||undefined})});setAgendaOrdinal('');setAgendaTitle('');setAgendaDescription('');setSuccess('Agenda item added.');await inspect(id)}
    catch(e){setError(e instanceof Error?e.message:'Could not add agenda item')}
    finally{setBusy(false)}
  }

  async function addResolution(e:FormEvent){
    e.preventDefault();if(!s||!selected||!canManage||!resolutionTitle.trim()||!resolutionText.trim())return
    const required=approvalRequired?Number(approvalRequired):undefined,recorded=approvalRecorded?Number(approvalRecorded):undefined
    if((required!=null&&required<0)||(recorded!=null&&recorded<0)){setError('Approval counts cannot be negative');return}
    const id=selected.id;setBusy(true);setError('');setSuccess('')
    try{
      await adminApi(s,`/governance/meetings/${id}/resolutions`,{method:'POST',body:JSON.stringify({title:resolutionTitle.trim(),resolutionText:resolutionText.trim(),status:resolutionStatus,approvalRequired:required,approvalRecorded:recorded,approvalRuleReference:resolutionRuleRef.trim()||undefined,byeLawReference:resolutionByeLawRef.trim()||undefined})})
      setResolutionTitle('');setResolutionText('');setResolutionStatus('PROPOSED');setApprovalRequired('');setApprovalRecorded('');setResolutionRuleRef('');setResolutionByeLawRef('');setSuccess('Resolution evidence recorded.');await inspect(id)
    }catch(e){setError(e instanceof Error?e.message:'Could not record resolution')}
    finally{setBusy(false)}
  }

  async function addAction(e:FormEvent){
    e.preventDefault();if(!s||!selected||!canManage||!actionTitle.trim())return
    const id=selected.id;setBusy(true);setError('');setSuccess('')
    try{
      await adminApi(s,`/governance/meetings/${id}/actions`,{method:'POST',body:JSON.stringify({title:actionTitle.trim(),description:actionDescription.trim()||undefined,ownerUserId:actionOwnerUserId.trim()||undefined,dueAt:actionDueAt?iso(actionDueAt):undefined})})
      setActionTitle('');setActionDescription('');setActionOwnerUserId('');setActionDueAt('');setSuccess('Action item added.');await inspect(id)
    }catch(e){setError(e instanceof Error?e.message:'Could not add action item')}
    finally{setBusy(false)}
  }

  async function updateAction(e:FormEvent){
    e.preventDefault();if(!s||!selected||!canManage||!actionFollowId)return
    const id=selected.id;setBusy(true);setError('');setSuccess('')
    try{
      await adminApi(s,`/governance/meetings/${id}/actions/${actionFollowId}/status`,{method:'POST',body:JSON.stringify({status:actionFollowStatus,ownerUserId:actionFollowOwner.trim()||undefined,dueAt:actionFollowDue?iso(actionFollowDue):undefined})})
      setActionFollowId('');setActionFollowStatus('OPEN');setActionFollowOwner('');setActionFollowDue('');setSuccess('Action follow-through updated.');await inspect(id)
    }catch(e){setError(e instanceof Error?e.message:'Could not update action item')}
    finally{setBusy(false)}
  }

  async function recordOutcome(e:FormEvent){
    e.preventDefault();if(!s||!selected||!canManage)return
    const quorum=outcomeQuorumPresent?Number(outcomeQuorumPresent):undefined
    if(quorum!=null&&quorum<0){setError('Quorum present cannot be negative');return}
    if(outcomeStatus==='HELD'&&!outcomeHeldAt){setError('Held at is required when marking a meeting held');return}
    const id=selected.id;setBusy(true);setError('');setSuccess('')
    try{
      await adminApi(s,`/governance/meetings/${id}/outcome`,{method:'POST',body:JSON.stringify({status:outcomeStatus,heldAt:outcomeStatus==='HELD'?iso(outcomeHeldAt):undefined,quorumPresent:quorum,minutesSummary:outcomeMinutes.trim()||undefined,quorumRuleReference:outcomeRuleRef.trim()||undefined,byeLawReference:outcomeByeLawRef.trim()||undefined})})
      setSuccess('Meeting outcome and minutes evidence recorded.');await load();await inspect(id)
    }catch(e){setError(e instanceof Error?e.message:'Could not record meeting outcome')}
    finally{setBusy(false)}
  }

  if(!s||!canRead)return <PageShell><PageHeader title="Governance access required" actions={<a href="/">Return to Admin</a>}/></PageShell>

  const queueState=loading?'loading':error?'error':meetings.length===0?'empty':'ready'
  const detailState=detailLoading?'loading':detailError?'error':!selected?'empty':'ready'

  return <PageShell>
    <PageHeader
      context={`${s.societyName??'Current society'} · ${human(s.role)}`}
      title="Governance workspace"
      description="Manage committee tenure, meetings, agenda, minutes, resolutions and action evidence without hard-coding statutory thresholds."
      actions={<><a href="/">← Admin home</a><a href="/governance/polls">Community polls</a><a href="/governance/readiness">Readiness & closure evidence →</a></>}
    />
    {error&&<ErrorState title="Governance operation failed" description={error}/>}
    <ActionBar feedback={success} label="Governance workspace actions"><SecondaryButton loading={loading} disabled={busy} onClick={()=>void load()}>Refresh workspace</SecondaryButton></ActionBar>

    {canManage&&<section style={formsGrid}>
      <form onSubmit={addTenure} style={panel}><h2>Committee tenure</h2>
        <FormField label="User ID" required value={userId} onChange={e=>setUserId(e.target.value)}/>
        <FormField label="Role name" required value={roleName} onChange={e=>setRoleName(e.target.value)} placeholder="Secretary, Treasurer, President…"/>
        <FormField label="Effective from" required type="datetime-local" value={tenureFrom} onChange={e=>setTenureFrom(e.target.value)}/>
        <FormField label="Effective to (optional)" type="datetime-local" value={tenureTo} onChange={e=>setTenureTo(e.target.value)}/>
        <PrimaryButton type="submit" loading={busy}>Add tenure</PrimaryButton>
      </form>
      <form onSubmit={createMeeting} style={panel}><h2>Create meeting</h2>
        <SelectField label="Type" value={meetingType} onChange={e=>setMeetingType(e.target.value as Meeting['meetingType'])}><option>AGM</option><option>SGM</option><option>COMMITTEE</option><option>BUSINESS</option></SelectField>
        <FormField label="Title" required value={meetingTitle} onChange={e=>setMeetingTitle(e.target.value)}/>
        <FormField label="Scheduled at" required type="datetime-local" value={scheduledAt} onChange={e=>setScheduledAt(e.target.value)}/>
        <FormField label="Location" value={location} onChange={e=>setLocation(e.target.value)}/>
        <FormField label="Quorum required" type="number" min="0" value={quorumRequired} onChange={e=>setQuorumRequired(e.target.value)}/>
        <FormField label="Quorum rule reference" value={ruleRef} onChange={e=>setRuleRef(e.target.value)}/>
        <FormField label="Bye-law reference" value={byeLawRef} onChange={e=>setByeLawRef(e.target.value)}/>
        <PrimaryButton type="submit" loading={busy}>Create meeting</PrimaryButton>
      </form>
    </section>}

    <section style={panel} aria-labelledby="committee-heading">
      <div style={sectionHeader}><div><h2 id="committee-heading">Committee</h2><p style={muted}>{activeTenures.length} active tenure{activeTenures.length===1?'':'s'}</p></div></div>
      {tenures.length===0?<EmptyState title="No committee tenure records"/>:<div style={stack}>{tenures.map(t=><article key={t.id} style={item}>
        <span><b>{t.roleName}</b> · {t.userName??t.userId}<br/><small>{fmt(t.effectiveFrom)} → {fmt(t.effectiveTo)}{t.handoverNotes?` · ${t.handoverNotes}`:''}</small></span>
        {canManage&&!t.effectiveTo&&<SecondaryButton disabled={busy} onClick={()=>{setEndingTenureId(t.id);setTenureEndAt(new Date().toISOString().slice(0,16));setHandoverNotes('')}}>End tenure</SecondaryButton>}
      </article>)}</div>}
    </section>

    {canManage&&endingTenureId&&<form onSubmit={endTenure} style={panel}><h2>End committee tenure</h2>
      <FormField label="Effective to" required type="datetime-local" value={tenureEndAt} onChange={e=>setTenureEndAt(e.target.value)}/>
      <FormField label="Handover notes" multiline value={handoverNotes} onChange={e=>setHandoverNotes(e.target.value)}/>
      <ActionBar feedback={success}><PrimaryButton type="submit" loading={busy}>Confirm end tenure</PrimaryButton><SecondaryButton type="button" disabled={busy} onClick={()=>{setEndingTenureId('');setTenureEndAt('');setHandoverNotes('')}}>Cancel</SecondaryButton></ActionBar>
    </form>}

    <PageShell.Columns>
      <QueuePanel
        title="Meetings"
        count={meetings.length}
        state={queueState}
        loadingLabel="Loading governance meetings…"
        error={<ErrorState title="Governance meetings unavailable" description={error}/>}
        empty={<EmptyState title="No governance meetings"/>}
      >
        <div style={queueList}>{meetings.map(m=><button key={m.id} type="button" aria-pressed={selected?.id===m.id} onClick={()=>void inspect(m.id)} style={{...meetingButton,...(selected?.id===m.id?selectedMeeting:{})}}>
          <span style={queueMeta}><strong>{m.meetingType} · {m.title}</strong><small>{fmt(m.scheduledAt)}{m.location?` · ${m.location}`:''}</small></span>
          <StatusPill label={human(m.status)} tone={m.status==='HELD'?'success':m.status==='CANCELLED'?'danger':'info'}/>
        </button>)}</div>
      </QueuePanel>

      <DetailPanel
        title={selected?`${selected.meetingType} · ${selected.title}`:'Meeting detail'}
        state={detailState}
        loadingLabel="Loading meeting evidence…"
        error={<ErrorState title="Meeting evidence unavailable" description={detailError}/>}
        empty={<EmptyState title="Select a governance meeting" description="Choose a meeting to review agenda, resolutions, actions and evidence."/>}
        actions={selected?<StatusPill label={human(selected.status)} tone={selected.status==='HELD'?'success':selected.status==='CANCELLED'?'danger':'info'}/>:undefined}
      >
        {selected&&<>
          <EvidenceGrid items={[
            {id:'scheduled',label:'Scheduled',value:fmt(selected.scheduledAt)},
            {id:'held',label:'Held',value:fmt(selected.heldAt)},
            {id:'location',label:'Location',value:selected.location??'—'},
            {id:'quorum',label:'Quorum',value:`${selected.quorumPresent??'—'} / ${selected.quorumRequired??'—'}`},
            {id:'quorum-rule',label:'Quorum rule reference',value:selected.quorumRuleReference??'—'},
            {id:'bye-law',label:'Bye-law reference',value:selected.byeLawReference??'—'},
          ]}/>
          {selected.minutesSummary&&<section style={note}><b>Minutes summary</b><p>{selected.minutesSummary}</p></section>}

          {canManage&&<section style={formsGrid}>
            <form onSubmit={addAgenda} style={subPanel}><h3>Add agenda item</h3>
              <FormField label="Order" type="number" min="1" value={agendaOrdinal} onChange={e=>setAgendaOrdinal(e.target.value)} placeholder={String(selected.agenda.length+1)}/>
              <FormField label="Title" required value={agendaTitle} onChange={e=>setAgendaTitle(e.target.value)}/>
              <FormField label="Description" multiline value={agendaDescription} onChange={e=>setAgendaDescription(e.target.value)}/>
              <SecondaryButton type="submit" loading={busy}>Add agenda</SecondaryButton>
            </form>

            <form onSubmit={addResolution} style={subPanel}><h3>Record resolution</h3>
              <FormField label="Title" required value={resolutionTitle} onChange={e=>setResolutionTitle(e.target.value)}/>
              <FormField label="Resolution text" multiline required value={resolutionText} onChange={e=>setResolutionText(e.target.value)}/>
              <SelectField label="Status" value={resolutionStatus} onChange={e=>setResolutionStatus(e.target.value as Resolution['status'])}><option>PROPOSED</option><option>PASSED</option><option>REJECTED</option><option>WITHDRAWN</option></SelectField>
              <FormField label="Approval required" type="number" min="0" value={approvalRequired} onChange={e=>setApprovalRequired(e.target.value)}/>
              <FormField label="Approval recorded" type="number" min="0" value={approvalRecorded} onChange={e=>setApprovalRecorded(e.target.value)}/>
              <FormField label="Approval rule reference" value={resolutionRuleRef} onChange={e=>setResolutionRuleRef(e.target.value)}/>
              <FormField label="Bye-law reference" value={resolutionByeLawRef} onChange={e=>setResolutionByeLawRef(e.target.value)}/>
              <SecondaryButton type="submit" loading={busy}>Record resolution</SecondaryButton>
            </form>

            <form onSubmit={addAction} style={subPanel}><h3>Add action item</h3>
              <FormField label="Title" required value={actionTitle} onChange={e=>setActionTitle(e.target.value)}/>
              <FormField label="Description" multiline value={actionDescription} onChange={e=>setActionDescription(e.target.value)}/>
              <FormField label="Owner user ID" value={actionOwnerUserId} onChange={e=>setActionOwnerUserId(e.target.value)}/>
              <FormField label="Due at" type="datetime-local" value={actionDueAt} onChange={e=>setActionDueAt(e.target.value)}/>
              <SecondaryButton type="submit" loading={busy}>Add action</SecondaryButton>
            </form>

            <form onSubmit={updateAction} style={subPanel}><h3>Action follow-through</h3>
              <SelectField label="Action" required value={actionFollowId} onChange={e=>{const id=e.target.value;setActionFollowId(id);const a=selected.actions.find(x=>x.id===id);if(a){setActionFollowStatus(a.status);setActionFollowOwner(a.ownerUserId??'');setActionFollowDue(a.dueAt?new Date(a.dueAt).toISOString().slice(0,16):'')}}}><option value="">Select action</option>{selected.actions.map(a=><option key={a.id} value={a.id}>{a.status} · {a.title}</option>)}</SelectField>
              <SelectField label="Status" value={actionFollowStatus} onChange={e=>setActionFollowStatus(e.target.value as ActionItem['status'])}><option>OPEN</option><option>IN_PROGRESS</option><option>COMPLETED</option><option>CANCELLED</option></SelectField>
              <FormField label="Owner user ID" value={actionFollowOwner} onChange={e=>setActionFollowOwner(e.target.value)}/>
              <FormField label="Due at" type="datetime-local" value={actionFollowDue} onChange={e=>setActionFollowDue(e.target.value)}/>
              <PrimaryButton type="submit" loading={busy} disabled={!actionFollowId}>Update action</PrimaryButton>
            </form>

            <form onSubmit={recordOutcome} style={subPanel}><h3>Record meeting outcome</h3>
              <SelectField label="Status" value={outcomeStatus} onChange={e=>setOutcomeStatus(e.target.value as Meeting['status'])}><option>SCHEDULED</option><option>HELD</option><option>CANCELLED</option></SelectField>
              {outcomeStatus==='HELD'&&<FormField label="Held at" required type="datetime-local" value={outcomeHeldAt} onChange={e=>setOutcomeHeldAt(e.target.value)}/>}
              <FormField label="Quorum present" type="number" min="0" value={outcomeQuorumPresent} onChange={e=>setOutcomeQuorumPresent(e.target.value)}/>
              <FormField label="Minutes summary" multiline value={outcomeMinutes} onChange={e=>setOutcomeMinutes(e.target.value)}/>
              <FormField label="Quorum rule reference" value={outcomeRuleRef} onChange={e=>setOutcomeRuleRef(e.target.value)}/>
              <FormField label="Bye-law reference" value={outcomeByeLawRef} onChange={e=>setOutcomeByeLawRef(e.target.value)}/>
              <PrimaryButton type="submit" loading={busy}>Record outcome / minutes</PrimaryButton>
            </form>
          </section>}

          <section><h3>Agenda</h3>{selected.agenda.length===0?<EmptyState title="No agenda items"/>:<div style={stack}>{selected.agenda.map(a=><article key={a.id} style={item}><span><b>{a.ordinal}. {a.title}</b>{a.description?<><br/><small>{a.description}</small></>:null}</span></article>)}</div>}</section>
          <section><h3>Resolutions</h3>{selected.resolutions.length===0?<EmptyState title="No resolutions"/>:<div style={stack}>{selected.resolutions.map(r=><article key={r.id} style={item}><span><div style={statusRow}><StatusPill label={human(r.status)} tone={r.status==='PASSED'?'success':r.status==='REJECTED'||r.status==='WITHDRAWN'?'danger':'info'}/><b>{r.title}</b></div><small>{r.resolutionText}</small>{r.approvalRequired!=null||r.approvalRecorded!=null?<><br/><small>Approval evidence {r.approvalRecorded??'—'} / {r.approvalRequired??'—'}</small></>:null}</span></article>)}</div>}</section>
          <section><h3>Action items</h3>{selected.actions.length===0?<EmptyState title="No action items"/>:<div style={stack}>{selected.actions.map(a=>{const overdue=!!a.dueAt&&a.status!=='COMPLETED'&&a.status!=='CANCELLED'&&new Date(a.dueAt).getTime()<Date.now();return <article key={a.id} style={item}><span><div style={statusRow}><StatusPill label={human(a.status)} tone={a.status==='COMPLETED'?'success':a.status==='CANCELLED'?'danger':overdue?'warning':'info'}/><b>{a.title}</b>{overdue&&<StatusPill label="OVERDUE" tone="warning"/>}</div>{a.description?<><small>{a.description}</small><br/></>:null}<small>Owner {a.ownerUserId??'Unassigned'} · due {fmt(a.dueAt)}{a.completedAt?` · completed ${fmt(a.completedAt)}`:''}</small></span>{canManage&&<SecondaryButton type="button" disabled={busy} onClick={()=>{setActionFollowId(a.id);setActionFollowStatus(a.status);setActionFollowOwner(a.ownerUserId??'');setActionFollowDue(a.dueAt?new Date(a.dueAt).toISOString().slice(0,16):'')}}>Follow up</SecondaryButton>}</article>})}</div>}</section>
          <section><h3>Evidence trail</h3><Timeline label="Governance evidence trail" emptyLabel="No evidence events." events={selected.evidence.map(ev=>({id:ev.id,label:human(ev.eventType),dateTime:ev.createdAt,timeLabel:fmt(ev.createdAt),evidence:<div>{ev.summary}</div>}))}/></section>
        </>}
      </DetailPanel>
    </PageShell.Columns>
  </PageShell>
}

const formsGrid={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,300px),1fr))',gap:16} as const
const panel={display:'grid',gap:12,padding:18,border:'1px solid var(--line,#d5e8eb)',borderRadius:16,background:'var(--surface,#fff)'} as const
const subPanel={display:'grid',gap:10,padding:14,border:'1px solid var(--line,#d5e8eb)',borderRadius:12,background:'var(--neutral-soft,#f8fafc)'} as const
const note={padding:14,background:'var(--neutral-soft,#f8fafc)',borderRadius:12} as const
const stack={display:'grid',gap:8} as const
const item={display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--line,#e5e7eb)',flexWrap:'wrap'} as const
const sectionHeader={display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'} as const
const muted={margin:0,color:'var(--muted,#64748b)'} as const
const queueList={display:'grid',gap:8} as const
const meetingButton={display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',width:'100%',padding:12,border:'1px solid var(--line,#d5e8eb)',borderRadius:12,background:'var(--surface,#fff)',color:'var(--ink,#17323a)',textAlign:'left',font:'inherit',cursor:'pointer'} as const
const selectedMeeting={background:'var(--neutral-soft,#eef6f7)',borderColor:'var(--brand,#05879a)',boxShadow:'inset 3px 0 0 var(--brand,#05879a)'} as const
const queueMeta={display:'grid',gap:4,minWidth:0} as const
const statusRow={display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'} as const
