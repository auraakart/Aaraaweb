'use client'

import { FormEvent,useCallback,useEffect,useMemo,useRef,useState } from 'react'
import {
  ActionBar,DangerButton,DetailPanel,EmptyState,ErrorState,EvidenceGrid,FormField,PageHeader,PageShell,
  PrimaryButton,QueuePanel,ReadinessPanel,SecondaryButton,SelectField,StatusPill,Timeline,
} from '../../components/admin-ui'
import { api, type Session } from '../../lib/admin-client'

type Lifecycle={id:string;unitId:string;userId:string;occupancyId?:string|null;kind:'MOVE_IN'|'MOVE_OUT';relation:'OWNER'|'TENANT'|'FAMILY_MEMBER';status:'REQUESTED'|'APPROVED'|'REJECTED'|'COMPLETED'|'CANCELLED';effectiveAt:string;reason?:string|null;requestedByUserId:string;reviewedAt?:string|null;completedAt?:string|null;createdAt:string}
type Checklist={id:string;code:string;label:string;required:boolean;completedAt?:string|null;note?:string|null}
type DocumentRef={id:string;kind:string;fileReference:string;verifiedAt?:string|null;note?:string|null}
type Detail=Lifecycle&{events:Array<{id:string;eventType:string;actorUserId:string;note?:string|null;createdAt:string}>;checklist:Checklist[];documents:DocumentRef[]}
type Building={id:string;name:string;code:string}
type UnitOption={id:string;number:string;building:Building}
type ActiveOccupancy={id:string;relation:string;effectiveFrom:string;user:{id:string;name:string;phone:string;status:string};unit:UnitOption}
type OperatorContext={units:UnitOption[];occupancies:ActiveOccupancy[]}
type ReadinessEvidence={requestId:string;kind:'MOVE_IN'|'MOVE_OUT';checklist:{total:number;required:number;completedRequired:number;mandatoryReady:boolean};documents:{total:number;verified:number};handover:{activeVehicles:number;activeWorkforceAssignments:number;activeParkingAllocations:number;gateAuthority:{primaryGateContact:boolean;gateApprovalEnabled:boolean;gateNotificationEnabled:boolean}|null};boundary:string}

const manageRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER'])
const readRoles=new Set([...manageRoles,'COMMITTEE_MEMBER'])
function session():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw):null}catch{return null}}
const fmt=(v:string)=>new Date(v).toLocaleString('en-IN')
const unitLabel=(u:UnitOption)=>`${u.building.name} · ${u.number}`
const occupancyLabel=(o:ActiveOccupancy)=>`${o.user.name} · ${unitLabel(o.unit)} · ${o.relation.replaceAll('_',' ')}`
const human=(v:string)=>v.replaceAll('_',' ')

export default function OccupancyLifecyclePage(){
  const s=typeof window==='undefined'?null:session()
  const canRead=!!s&&readRoles.has(s.role),canManage=!!s&&manageRoles.has(s.role)
  const[items,setItems]=useState<Lifecycle[]>([])
  const[context,setContext]=useState<OperatorContext>({units:[],occupancies:[]})
  const[selected,setSelected]=useState<Detail|null>(null)
  const[readinessEvidence,setReadinessEvidence]=useState<ReadinessEvidence|null>(null)
  const[queueLoading,setQueueLoading]=useState(true)
  const[detailLoading,setDetailLoading]=useState(false)
  const[busy,setBusy]=useState(false)
  const[queueError,setQueueError]=useState('')
  const[detailError,setDetailError]=useState('')
  const[operationError,setOperationError]=useState('')
  const[success,setSuccess]=useState('')
  const[unitId,setUnitId]=useState('')
  const[residentPhone,setResidentPhone]=useState('+91')
  const[relation,setRelation]=useState<'OWNER'|'TENANT'>('TENANT')
  const[moveInAt,setMoveInAt]=useState('')
  const[moveOutOccupancy,setMoveOutOccupancy]=useState('')
  const[moveOutAt,setMoveOutAt]=useState('')
  const[moveInReason,setMoveInReason]=useState('')
  const[moveOutReason,setMoveOutReason]=useState('')
  const[reviewNote,setReviewNote]=useState('')
  const[checklistNotes,setChecklistNotes]=useState<Record<string,string>>({})
  const[docKind,setDocKind]=useState('TENANCY_AGREEMENT')
  const[docReference,setDocReference]=useState('')
  const[docNote,setDocNote]=useState('')
  const[verifyNotes,setVerifyNotes]=useState<Record<string,string>>({})
  const detailRequest=useRef(0)

  const unitNames=useMemo(()=>new Map(context.units.map(u=>[u.id,unitLabel(u)])),[context.units])
  const occupancyById=useMemo(()=>new Map(context.occupancies.map(o=>[o.id,o])),[context.occupancies])

  const load=useCallback(async()=>{
    if(!s||!canRead)return
    setQueueLoading(true);setQueueError('')
    try{
      const[list,ctx]=await Promise.all([
        api<Lifecycle[]>('/occupancy-lifecycle',{},s),
        api<OperatorContext>('/occupancy-lifecycle/operator-context',{},s),
      ])
      setItems(list);setContext(ctx)
    }catch(e){setQueueError(e instanceof Error?e.message:'Could not load occupancy lifecycle')}
    finally{setQueueLoading(false)}
  },[s?.accessToken,canRead])

  useEffect(()=>{void load()},[load])

  async function inspect(id:string){
    if(!s)return
    const requestId=++detailRequest.current
    setDetailLoading(true);setDetailError('');setSelected(null);setReadinessEvidence(null);setReviewNote('')
    try{
      const[detail,evidence]=await Promise.all([
        api<Detail>(`/occupancy-lifecycle/${id}`,{},s),
        api<ReadinessEvidence>(`/occupancy-lifecycle/${id}/readiness`,{},s),
      ])
      if(requestId!==detailRequest.current)return
      setSelected(detail);setReadinessEvidence(evidence)
    }catch(e){
      if(requestId===detailRequest.current)setDetailError(e instanceof Error?e.message:'Could not load lifecycle request')
    }finally{
      if(requestId===detailRequest.current)setDetailLoading(false)
    }
  }

  async function moveIn(e:FormEvent){
    e.preventDefault();if(!s||!canManage)return
    setBusy(true);setOperationError('');setSuccess('')
    try{
      await api('/occupancy-lifecycle/move-ins/by-phone',{method:'POST',body:JSON.stringify({
        unitId,tenantPhone:residentPhone.trim(),relation,effectiveAt:new Date(moveInAt).toISOString(),reason:moveInReason.trim()||undefined,
      })},s)
      setUnitId('');setResidentPhone('+91');setMoveInAt('');setMoveInReason('');setSuccess('Move-in request created.');await load()
    }catch(e){setOperationError(e instanceof Error?e.message:'Could not request move-in')}
    finally{setBusy(false)}
  }

  async function moveOut(e:FormEvent){
    e.preventDefault();if(!s||!canManage)return
    setBusy(true);setOperationError('');setSuccess('')
    try{
      await api('/occupancy-lifecycle/move-outs',{method:'POST',body:JSON.stringify({
        occupancyId:moveOutOccupancy,effectiveAt:new Date(moveOutAt).toISOString(),reason:moveOutReason.trim()||undefined,
      })},s)
      setMoveOutOccupancy('');setMoveOutAt('');setMoveOutReason('');setSuccess('Move-out request created.');await load()
    }catch(e){setOperationError(e instanceof Error?e.message:'Could not request move-out')}
    finally{setBusy(false)}
  }

  async function review(kind:'approve'|'reject'){
    if(!s||!selected||!canManage)return
    setBusy(true);setOperationError('');setSuccess('')
    try{
      const id=selected.id
      await api(`/occupancy-lifecycle/${id}/${kind}`,{method:'POST',body:JSON.stringify({note:reviewNote.trim()||undefined})},s)
      setReviewNote('');setSuccess(`Request ${kind==='approve'?'approved':'rejected'}.`);await load();await inspect(id)
    }catch(e){setOperationError(e instanceof Error?e.message:`Could not ${kind} request`)}
    finally{setBusy(false)}
  }

  async function complete(){
    if(!s||!selected||!canManage)return
    setBusy(true);setOperationError('');setSuccess('')
    try{
      const id=selected.id
      await api(`/occupancy-lifecycle/${id}/complete`,{method:'POST'},s)
      setSuccess('Effective move completed.');await load();await inspect(id)
    }catch(e){setOperationError(e instanceof Error?e.message:'Could not complete request')}
    finally{setBusy(false)}
  }

  async function checklist(item:Checklist){
    if(!s||!selected||!canManage)return
    const id=selected.id,completed=!item.completedAt
    setBusy(true);setOperationError('')
    try{
      await api(`/occupancy-lifecycle/${id}/checklist/${item.id}`,{method:'POST',body:JSON.stringify({completed,note:checklistNotes[item.id]?.trim()||undefined})},s)
      setChecklistNotes(current=>({...current,[item.id]:''}));await inspect(id)
    }catch(e){setOperationError(e instanceof Error?e.message:'Could not update checklist')}
    finally{setBusy(false)}
  }

  async function addDocument(e:FormEvent){
    e.preventDefault();if(!s||!selected||!canManage)return
    const id=selected.id
    setBusy(true);setOperationError('')
    try{
      await api(`/occupancy-lifecycle/${id}/documents`,{method:'POST',body:JSON.stringify({kind:docKind.trim(),fileReference:docReference.trim(),note:docNote.trim()||undefined})},s)
      setDocReference('');setDocNote('');await inspect(id)
    }catch(e){setOperationError(e instanceof Error?e.message:'Could not add document')}
    finally{setBusy(false)}
  }

  async function verifyDocument(doc:DocumentRef){
    if(!s||!selected||!canManage||doc.verifiedAt)return
    const id=selected.id
    setBusy(true);setOperationError('')
    try{
      await api(`/occupancy-lifecycle/${id}/documents/${doc.id}/verify`,{method:'POST',body:JSON.stringify({note:verifyNotes[doc.id]?.trim()||undefined})},s)
      setVerifyNotes(current=>({...current,[doc.id]:''}));await inspect(id)
    }catch(e){setOperationError(e instanceof Error?e.message:'Could not verify document')}
    finally{setBusy(false)}
  }

  if(!s||!canRead)return <PageShell><PageHeader title="Occupancy lifecycle access required" actions={<a href="/">Return to Admin</a>}/></PageShell>

  const readiness=selected?.checklist.filter(i=>i.completedAt).length??0
  const total=selected?.checklist.length??0
  const queueState=queueLoading?'loading':queueError?'error':items.length===0?'empty':'ready'
  const detailState=detailLoading?'loading':detailError?'error':!selected?'empty':'ready'

  return <PageShell>
    <PageHeader
      context={`${s.societyName??'Current society'} · ${human(s.role)}`}
      title="Move-in & move-out"
      description="Review occupancy changes, verify readiness, and execute only when mandatory handover controls are complete. Legal ownership remains independent."
      actions={<a href="/">← Admin home</a>}
    />
    {operationError&&<ErrorState title="Occupancy operation failed" description={operationError}/>}
    <ActionBar feedback={success} label="Occupancy lifecycle actions">
      <SecondaryButton loading={queueLoading} disabled={busy} onClick={()=>void load()}>Refresh queue</SecondaryButton>
    </ActionBar>

    {canManage&&<section style={formsGrid}>
      <form onSubmit={moveIn} style={panel}>
        <h2>Request move-in</h2>
        <SelectField label="Unit" required value={unitId} onChange={e=>setUnitId(e.target.value)}>
          <option value="">Select unit</option>{context.units.map(u=><option key={u.id} value={u.id}>{unitLabel(u)}</option>)}
        </SelectField>
        <FormField label="Registered mobile" required value={residentPhone} onChange={e=>setResidentPhone(e.target.value)} maxLength={20} hint="The resident must already have an Aaraagate account for this mobile number."/>
        <SelectField label="Relationship" value={relation} onChange={e=>setRelation(e.target.value as 'OWNER'|'TENANT')}>
          <option value="TENANT">Tenant</option><option value="OWNER">Owner occupant</option>
        </SelectField>
        <FormField label="Effective at" required type="datetime-local" value={moveInAt} onChange={e=>setMoveInAt(e.target.value)}/>
        <FormField label="Reason" multiline value={moveInReason} onChange={e=>setMoveInReason(e.target.value)} maxLength={500}/>
        <ActionBar feedback={success}><PrimaryButton type="submit" loading={busy} disabled={!unitId||!residentPhone.trim()}>Create move-in</PrimaryButton></ActionBar>
      </form>

      <form onSubmit={moveOut} style={panel}>
        <h2>Request move-out</h2>
        <SelectField label="Active occupancy" required value={moveOutOccupancy} onChange={e=>setMoveOutOccupancy(e.target.value)}>
          <option value="">Select resident occupancy</option>{context.occupancies.map(o=><option key={o.id} value={o.id}>{occupancyLabel(o)}</option>)}
        </SelectField>
        {moveOutOccupancy&&<p style={muted}>{occupancyById.get(moveOutOccupancy)?.user.phone}</p>}
        <FormField label="Effective at" required type="datetime-local" value={moveOutAt} onChange={e=>setMoveOutAt(e.target.value)}/>
        <FormField label="Reason" multiline value={moveOutReason} onChange={e=>setMoveOutReason(e.target.value)} maxLength={500}/>
        <ActionBar feedback={success}><PrimaryButton type="submit" loading={busy} disabled={!moveOutOccupancy}>Create move-out</PrimaryButton></ActionBar>
      </form>
    </section>}

    <PageShell.Columns>
      <QueuePanel
        title="Lifecycle queue"
        count={items.length}
        state={queueState}
        loadingLabel="Loading occupancy requests…"
        error={<ErrorState title="Occupancy queue unavailable" description={queueError} action={<SecondaryButton onClick={()=>void load()}>Retry queue</SecondaryButton>}/>}
        empty={<EmptyState title="No lifecycle requests" description="No move-in or move-out requests are waiting in this society."/>}
      >
        <div style={queueList}>{items.map(item=><button key={item.id} type="button" aria-pressed={selected?.id===item.id} onClick={()=>void inspect(item.id)} style={{...itemButton,...(selected?.id===item.id?selectedItem:{})}}>
          <span style={queueMeta}><span style={statusRow}><StatusPill label={human(item.kind)} tone="info"/><StatusPill label={human(item.status)} tone={item.status==='COMPLETED'?'success':item.status==='REJECTED'||item.status==='CANCELLED'?'danger':item.status==='APPROVED'?'success':'neutral'}/></span><strong>{human(item.relation)}</strong><small>{unitNames.get(item.unitId)??`Unit ${item.unitId}`} · effective {fmt(item.effectiveAt)}</small></span><span aria-hidden="true">›</span>
        </button>)}</div>
      </QueuePanel>

      <DetailPanel
        title={selected?'Request detail':'Occupancy request'}
        state={detailState}
        loadingLabel="Loading lifecycle request…"
        error={<ErrorState title="Lifecycle request unavailable" description={detailError}/>}
        empty={<EmptyState title="Select a lifecycle request" description="Choose a request from the queue to review readiness, evidence and permitted actions."/>}
        actions={selected?<StatusPill label={human(selected.status)} tone={selected.status==='COMPLETED'?'success':selected.status==='REJECTED'||selected.status==='CANCELLED'?'danger':selected.status==='APPROVED'?'success':'info'}/>:undefined}
      >
        {selected&&<>
          <EvidenceGrid items={[
            {id:'type',label:'Type',value:human(selected.kind)},
            {id:'relationship',label:'Relationship',value:human(selected.relation)},
            {id:'effective',label:'Effective',value:fmt(selected.effectiveAt)},
            {id:'unit',label:'Unit',value:unitNames.get(selected.unitId)??selected.unitId},
            ...(selected.occupancyId?[{id:'occupancy',label:'Occupancy',value:occupancyById.get(selected.occupancyId)?occupancyLabel(occupancyById.get(selected.occupancyId)!):selected.occupancyId}]:[]),
            ...(selected.reason?[{id:'reason',label:'Reason',value:selected.reason}]:[]),
          ]}/>

          <ReadinessPanel
            title="Operational handover evidence"
            state={readinessEvidence?'ready':'loading'}
            status={{label:readinessEvidence?.checklist.mandatoryReady?'MANDATORY CHECKS READY':'MANDATORY CHECKS OPEN',tone:readinessEvidence?.checklist.mandatoryReady?'success':'warning'}}
            boundary={readinessEvidence?.boundary}
            blockers={readinessEvidence&&!readinessEvidence.checklist.mandatoryReady?['Complete all required checklist items before effective completion.']:[]}
            checks={readinessEvidence?<>
              <EvidenceGrid items={[
                {id:'required-checklist',label:'Required checklist',value:`${readinessEvidence.checklist.completedRequired}/${readinessEvidence.checklist.required}`},
                {id:'verified-documents',label:'Verified documents',value:`${readinessEvidence.documents.verified}/${readinessEvidence.documents.total}`},
                {id:'active-vehicles',label:'Active vehicles',value:readinessEvidence.handover.activeVehicles},
                {id:'active-workforce',label:'Active workforce',value:readinessEvidence.handover.activeWorkforceAssignments},
                {id:'parking-allocations',label:'Parking allocations',value:readinessEvidence.handover.activeParkingAllocations},
                {id:'current-gate-authority',label:'Current gate authority',value:readinessEvidence.handover.gateAuthority?readinessEvidence.handover.gateAuthority.gateApprovalEnabled?'ACTIVE':'LIMITED':'NONE'},
              ]}/>
              {selected.kind==='MOVE_OUT'&&(readinessEvidence.handover.activeVehicles>0||readinessEvidence.handover.activeWorkforceAssignments>0||readinessEvidence.handover.activeParkingAllocations>0)&&<p style={warningBox}>Review active household vehicles, workforce assignments and parking allocations as part of move-out handover. These signals are descriptive and do not by themselves block completion.</p>}
            </>:undefined}
          />

          <section aria-labelledby="move-checklist-heading">
            <h3 id="move-checklist-heading">Move checklist</h3>
            {selected.checklist.length===0?<EmptyState title="No checklist items"/>:<div style={stack}>{selected.checklist.map(item=><article key={item.id} style={evidenceRow}>
              <div style={grow}><div style={statusRow}><StatusPill label={item.completedAt?'COMPLETE':'OPEN'} tone={item.completedAt?'success':'warning'}/><strong>{item.label}</strong>{item.required&&<StatusPill label="REQUIRED" tone="neutral"/>}</div>{item.note&&<p style={muted}>{item.note}</p>}
                {canManage&&<FormField label="Operational note (optional)" value={checklistNotes[item.id]??''} onChange={e=>setChecklistNotes(current=>({...current,[item.id]:e.target.value}))} maxLength={500}/>}
              </div>{canManage&&(item.completedAt?<SecondaryButton disabled={busy} onClick={()=>void checklist(item)}>Reopen</SecondaryButton>:<PrimaryButton disabled={busy} onClick={()=>void checklist(item)}>Complete</PrimaryButton>)}
            </article>)}</div>}
          </section>

          <section aria-labelledby="documents-heading">
            <h3 id="documents-heading">Documents</h3>
            {canManage&&<form onSubmit={addDocument} style={subpanel}>
              <div style={formsGrid}>
                <SelectField label="Document type" value={docKind} onChange={e=>setDocKind(e.target.value)}>
                  {['TENANCY_AGREEMENT','ID_PROOF','OWNER_AUTHORIZATION','MOVE_CLEARANCE','OTHER'].map(v=><option key={v}>{v}</option>)}
                </SelectField>
                <FormField label="Document / file reference" required value={docReference} onChange={e=>setDocReference(e.target.value)} maxLength={500}/>
              </div>
              <FormField label="Note" multiline value={docNote} onChange={e=>setDocNote(e.target.value)} maxLength={500}/>
              <ActionBar feedback={success}><SecondaryButton type="submit" loading={busy} disabled={!docReference.trim()}>Add reference</SecondaryButton></ActionBar>
            </form>}
            {selected.documents.length===0?<EmptyState title="No document references"/>:<div style={stack}>{selected.documents.map(doc=><article key={doc.id} style={evidenceRow}>
              <div style={grow}><div style={statusRow}><strong>{human(doc.kind)}</strong><StatusPill label={doc.verifiedAt?'VERIFIED':'AWAITING VERIFICATION'} tone={doc.verifiedAt?'success':'warning'}/></div><p>{doc.fileReference}</p>{doc.verifiedAt&&<small>Verified {fmt(doc.verifiedAt)}</small>}{doc.note&&<p style={muted}>{doc.note}</p>}
                {canManage&&!doc.verifiedAt&&<FormField label="Verification note (optional)" value={verifyNotes[doc.id]??''} onChange={e=>setVerifyNotes(current=>({...current,[doc.id]:e.target.value}))} maxLength={500}/>}
              </div>{canManage&&!doc.verifiedAt&&<PrimaryButton disabled={busy} onClick={()=>void verifyDocument(doc)}>Verify</PrimaryButton>}
            </article>)}</div>}
          </section>

          {canManage&&selected.status==='REQUESTED'&&<section style={subpanel} aria-labelledby="review-decision-heading">
            <h3 id="review-decision-heading">Review decision</h3>
            <FormField label="Review note" multiline value={reviewNote} onChange={e=>setReviewNote(e.target.value)} maxLength={500}/>
            <ActionBar feedback={success}><PrimaryButton disabled={busy} onClick={()=>void review('approve')}>Approve</PrimaryButton><DangerButton disabled={busy} onClick={()=>void review('reject')}>Reject</DangerButton></ActionBar>
          </section>}

          {canManage&&selected.status==='APPROVED'&&<ActionBar feedback={success}>
            <PrimaryButton disabled={busy||new Date(selected.effectiveAt).getTime()>Date.now()||readiness<total} onClick={()=>void complete()}>Complete effective move</PrimaryButton>
          </ActionBar>}

          <section aria-labelledby="audit-trail-heading"><h3 id="audit-trail-heading">Audit trail</h3>
            <Timeline label="Occupancy lifecycle audit trail" emptyLabel="No audit events." events={selected.events.map(ev=>({
              id:ev.id,label:human(ev.eventType),dateTime:ev.createdAt,timeLabel:fmt(ev.createdAt),evidence:ev.note?<div>{ev.note}</div>:undefined,
            }))}/>
          </section>
        </>}
      </DetailPanel>
    </PageShell.Columns>
  </PageShell>
}

const formsGrid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,300px),1fr))',gap:16}
const panel:React.CSSProperties={display:'grid',gap:12,padding:18,border:'1px solid var(--line, #d5e8eb)',borderRadius:16,background:'var(--surface, #fff)'}
const subpanel:React.CSSProperties={display:'grid',gap:12,padding:14,border:'1px solid var(--line, #d5e8eb)',borderRadius:12,background:'var(--neutral-soft, #eef6f7)'}
const queueList:React.CSSProperties={display:'grid',gap:8}
const itemButton:React.CSSProperties={width:'100%',display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,textAlign:'left',padding:12,border:'1px solid var(--line, #d5e8eb)',borderRadius:12,background:'var(--surface, #fff)',color:'var(--ink, #17323a)',cursor:'pointer',font:'inherit'}
const selectedItem:React.CSSProperties={background:'var(--neutral-soft, #eef6f7)',borderColor:'var(--brand, #05879a)',boxShadow:'inset 3px 0 0 var(--brand, #05879a)'}
const queueMeta:React.CSSProperties={display:'grid',gap:6,minWidth:0}
const statusRow:React.CSSProperties={display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}
const stack:React.CSSProperties={display:'grid',gap:10}
const evidenceRow:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start',padding:'12px 0',borderBottom:'1px solid var(--line, #d5e8eb)',flexWrap:'wrap'}
const grow:React.CSSProperties={flex:'1 1 420px',minWidth:0}
const muted:React.CSSProperties={color:'var(--muted, #64748b)',fontSize:13}
const warningBox:React.CSSProperties={padding:12,background:'var(--warning-soft, #fffbeb)',color:'var(--warning-ink, #92400e)',border:'1px solid var(--warning-line, #fde68a)',borderRadius:10}
