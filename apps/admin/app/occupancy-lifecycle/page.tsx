'use client'

import { FormEvent,useEffect,useMemo,useState } from 'react'

type Session={accessToken:string;role:string;societyName?:string}
type Lifecycle={id:string;unitId:string;userId:string;occupancyId?:string|null;kind:'MOVE_IN'|'MOVE_OUT';relation:'OWNER'|'TENANT'|'FAMILY_MEMBER';status:'REQUESTED'|'APPROVED'|'REJECTED'|'COMPLETED'|'CANCELLED';effectiveAt:string;reason?:string|null;requestedByUserId:string;reviewedAt?:string|null;completedAt?:string|null;createdAt:string}
type Checklist={id:string;code:string;label:string;required:boolean;completedAt?:string|null;note?:string|null}
type DocumentRef={id:string;kind:string;fileReference:string;verifiedAt?:string|null;note?:string|null}
type Detail=Lifecycle&{events:Array<{id:string;eventType:string;actorUserId:string;note?:string|null;createdAt:string}>;checklist:Checklist[];documents:DocumentRef[]}
type Building={id:string;name:string;code:string}
type UnitOption={id:string;number:string;building:Building}
type ActiveOccupancy={id:string;relation:string;effectiveFrom:string;user:{id:string;name:string;phone:string;status:string};unit:UnitOption}
type OperatorContext={units:UnitOption[];occupancies:ActiveOccupancy[]}

const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
const manageRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER'])
const readRoles=new Set([...manageRoles,'COMMITTEE_MEMBER'])
function session():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw):null}catch{return null}}
async function api<T>(s:Session,path:string,init:RequestInit={}):Promise<T>{const r=await fetch(`${base}/api/v1${path}`,{...init,headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.accessToken}`,...init.headers}});const text=await r.text(),body=text?JSON.parse(text):null;if(!r.ok)throw new Error(Array.isArray(body?.message)?body.message.join(', '):body?.message??`Request failed (${r.status})`);return body as T}
const fmt=(v:string)=>new Date(v).toLocaleString('en-IN')
const unitLabel=(u:UnitOption)=>`${u.building.name} · ${u.number}`
const occupancyLabel=(o:ActiveOccupancy)=>`${o.user.name} · ${unitLabel(o.unit)} · ${o.relation.replaceAll('_',' ')}`

export default function OccupancyLifecyclePage(){
 const s=typeof window==='undefined'?null:session()
 const canRead=!!s&&readRoles.has(s.role),canManage=!!s&&manageRoles.has(s.role)
 const[items,setItems]=useState<Lifecycle[]>([]),[context,setContext]=useState<OperatorContext>({units:[],occupancies:[]}),[selected,setSelected]=useState<Detail|null>(null),[error,setError]=useState(''),[success,setSuccess]=useState(''),[busy,setBusy]=useState(false)
 const[unitId,setUnitId]=useState(''),[residentPhone,setResidentPhone]=useState('+91'),[relation,setRelation]=useState<'OWNER'|'TENANT'>('TENANT'),[moveInAt,setMoveInAt]=useState(''),[moveOutOccupancy,setMoveOutOccupancy]=useState(''),[moveOutAt,setMoveOutAt]=useState(''),[moveInReason,setMoveInReason]=useState(''),[moveOutReason,setMoveOutReason]=useState('')
 const[reviewNote,setReviewNote]=useState(''),[checklistNotes,setChecklistNotes]=useState<Record<string,string>>({}),[docKind,setDocKind]=useState('TENANCY_AGREEMENT'),[docReference,setDocReference]=useState(''),[docNote,setDocNote]=useState(''),[verifyNotes,setVerifyNotes]=useState<Record<string,string>>({})

 const unitNames=useMemo(()=>new Map(context.units.map(u=>[u.id,unitLabel(u)])),[context.units])
 const occupancyById=useMemo(()=>new Map(context.occupancies.map(o=>[o.id,o])),[context.occupancies])

 async function load(){if(!s||!canRead)return;setBusy(true);setError('');try{const[list,ctx]=await Promise.all([api<Lifecycle[]>(s,'/occupancy-lifecycle'),api<OperatorContext>(s,'/occupancy-lifecycle/operator-context')]);setItems(list);setContext(ctx)}catch(e){setError(e instanceof Error?e.message:'Could not load occupancy lifecycle')}finally{setBusy(false)}}
 useEffect(()=>{void load()},[])

 async function inspect(id:string){if(!s)return;setBusy(true);setError('');try{setSelected(await api<Detail>(s,`/occupancy-lifecycle/${id}`));setReviewNote('')}catch(e){setError(e instanceof Error?e.message:'Could not load lifecycle request')}finally{setBusy(false)}}

 async function moveIn(e:FormEvent){e.preventDefault();if(!s||!canManage)return;setBusy(true);setError('');setSuccess('');try{await api(s,'/occupancy-lifecycle/move-ins/by-phone',{method:'POST',body:JSON.stringify({unitId,tenantPhone:residentPhone.trim(),relation,effectiveAt:new Date(moveInAt).toISOString(),reason:moveInReason.trim()||undefined})});setUnitId('');setResidentPhone('+91');setMoveInAt('');setMoveInReason('');setSuccess('Move-in request created.');await load()}catch(e){setError(e instanceof Error?e.message:'Could not request move-in')}finally{setBusy(false)}}

 async function moveOut(e:FormEvent){e.preventDefault();if(!s||!canManage)return;setBusy(true);setError('');setSuccess('');try{await api(s,'/occupancy-lifecycle/move-outs',{method:'POST',body:JSON.stringify({occupancyId:moveOutOccupancy,effectiveAt:new Date(moveOutAt).toISOString(),reason:moveOutReason.trim()||undefined})});setMoveOutOccupancy('');setMoveOutAt('');setMoveOutReason('');setSuccess('Move-out request created.');await load()}catch(e){setError(e instanceof Error?e.message:'Could not request move-out')}finally{setBusy(false)}}

 async function review(kind:'approve'|'reject'){if(!s||!selected||!canManage)return;setBusy(true);setError('');setSuccess('');try{await api(s,`/occupancy-lifecycle/${selected.id}/${kind}`,{method:'POST',body:JSON.stringify({note:reviewNote.trim()||undefined})});setReviewNote('');setSuccess(`Request ${kind==='approve'?'approved':'rejected'}.`);await load();await inspect(selected.id)}catch(e){setError(e instanceof Error?e.message:`Could not ${kind} request`)}finally{setBusy(false)}}

 async function complete(){if(!s||!selected||!canManage)return;setBusy(true);setError('');setSuccess('');try{await api(s,`/occupancy-lifecycle/${selected.id}/complete`,{method:'POST'});setSuccess('Effective move completed.');await load();await inspect(selected.id)}catch(e){setError(e instanceof Error?e.message:'Could not complete request')}finally{setBusy(false)}}

 async function checklist(item:Checklist){if(!s||!selected||!canManage)return;const completed=!item.completedAt;setBusy(true);setError('');try{await api(s,`/occupancy-lifecycle/${selected.id}/checklist/${item.id}`,{method:'POST',body:JSON.stringify({completed,note:checklistNotes[item.id]?.trim()||undefined})});setChecklistNotes(current=>({...current,[item.id]:''}));await inspect(selected.id)}catch(e){setError(e instanceof Error?e.message:'Could not update checklist')}finally{setBusy(false)}}

 async function addDocument(e:FormEvent){e.preventDefault();if(!s||!selected||!canManage)return;setBusy(true);setError('');try{await api(s,`/occupancy-lifecycle/${selected.id}/documents`,{method:'POST',body:JSON.stringify({kind:docKind.trim(),fileReference:docReference.trim(),note:docNote.trim()||undefined})});setDocReference('');setDocNote('');await inspect(selected.id)}catch(e){setError(e instanceof Error?e.message:'Could not add document')}finally{setBusy(false)}}

 async function verifyDocument(doc:DocumentRef){if(!s||!selected||!canManage||doc.verifiedAt)return;setBusy(true);setError('');try{await api(s,`/occupancy-lifecycle/${selected.id}/documents/${doc.id}/verify`,{method:'POST',body:JSON.stringify({note:verifyNotes[doc.id]?.trim()||undefined})});setVerifyNotes(current=>({...current,[doc.id]:''}));await inspect(selected.id)}catch(e){setError(e instanceof Error?e.message:'Could not verify document')}finally{setBusy(false)}}

 if(!s||!canRead)return <main style={{padding:32}}><h1>Occupancy lifecycle access required</h1><a href="/">Return to Admin</a></main>
 const readiness=selected?.checklist.filter(i=>i.completedAt).length??0,total=selected?.checklist.length??0

 return <main style={{maxWidth:1180,margin:'0 auto',padding:'28px 22px 80px'}}>
  <header><small>{s.societyName??'Current society'} · {s.role.replaceAll('_',' ')}</small><h1>Move-in & move-out</h1><p>Review occupancy changes, verify readiness, and execute only when mandatory handover controls are complete. Legal ownership remains independent.</p><a href="/">← Admin home</a></header>
  {error&&<p style={errorBox}>{error}</p>}{success&&<p style={successBox}>{success}</p>}

  {canManage&&<section style={grid}>
   <form onSubmit={moveIn} style={panel}><h2>Request move-in</h2>
    <label>Unit<select required value={unitId} onChange={e=>setUnitId(e.target.value)} style={input}><option value="">Select unit</option>{context.units.map(u=><option key={u.id} value={u.id}>{unitLabel(u)}</option>)}</select></label>
    <label>Registered mobile<input required value={residentPhone} onChange={e=>setResidentPhone(e.target.value)} style={input} maxLength={20}/></label>
    <small>The resident must already have an Aaraagate account for this mobile number.</small>
    <label>Relationship<select value={relation} onChange={e=>setRelation(e.target.value as 'OWNER'|'TENANT')} style={input}><option value="TENANT">Tenant</option><option value="OWNER">Owner occupant</option></select></label>
    <label>Effective at<input required type="datetime-local" value={moveInAt} onChange={e=>setMoveInAt(e.target.value)} style={input}/></label>
    <label>Reason<textarea value={moveInReason} onChange={e=>setMoveInReason(e.target.value)} style={input} maxLength={500}/></label>
    <button disabled={busy||!unitId||!residentPhone.trim()} style={button}>Create move-in</button>
   </form>

   <form onSubmit={moveOut} style={panel}><h2>Request move-out</h2>
    <label>Active occupancy<select required value={moveOutOccupancy} onChange={e=>setMoveOutOccupancy(e.target.value)} style={input}><option value="">Select resident occupancy</option>{context.occupancies.map(o=><option key={o.id} value={o.id}>{occupancyLabel(o)}</option>)}</select></label>
    {moveOutOccupancy&&<small>{occupancyById.get(moveOutOccupancy)?.user.phone}</small>}
    <label>Effective at<input required type="datetime-local" value={moveOutAt} onChange={e=>setMoveOutAt(e.target.value)} style={input}/></label>
    <label>Reason<textarea value={moveOutReason} onChange={e=>setMoveOutReason(e.target.value)} style={input} maxLength={500}/></label>
    <button disabled={busy||!moveOutOccupancy} style={button}>Create move-out</button>
   </form>
  </section>}

  <section style={panel}><div style={row}><h2 style={{margin:0}}>Lifecycle queue</h2><button onClick={()=>void load()} disabled={busy} style={secondary}>Refresh</button></div>
   {items.length===0?<p>No lifecycle requests.</p>:items.map(item=><button key={item.id} onClick={()=>void inspect(item.id)} style={itemButton}><span><b>{item.kind.replace('_',' ')}</b> · {item.relation.replaceAll('_',' ')} · <strong>{item.status}</strong><br/><small>{unitNames.get(item.unitId)??`Unit ${item.unitId}`} · effective {fmt(item.effectiveAt)}</small></span><span>›</span></button>)}
  </section>

  {selected&&<section style={panel}>
   <div style={row}><div><h2 style={{marginBottom:4}}>Request detail</h2><small>{selected.id}</small></div><strong>{selected.status}</strong></div>
   <dl style={details}><dt>Type</dt><dd>{selected.kind.replace('_',' ')}</dd><dt>Relationship</dt><dd>{selected.relation.replaceAll('_',' ')}</dd><dt>Effective</dt><dd>{fmt(selected.effectiveAt)}</dd><dt>Unit</dt><dd>{unitNames.get(selected.unitId)??selected.unitId}</dd>{selected.occupancyId&&<><dt>Occupancy</dt><dd>{occupancyById.get(selected.occupancyId)?occupancyLabel(occupancyById.get(selected.occupancyId)!):selected.occupancyId}</dd></>}{selected.reason&&<><dt>Reason</dt><dd>{selected.reason}</dd></>}</dl>
   <div style={readinessBox}><b>Readiness {readiness}/{total}</b><span>{readiness===total&&total>0?'All mandatory checks complete':'Completion remains blocked until all mandatory checks are complete'}</span></div>

   <h3>Move checklist</h3>
   {selected.checklist.length===0?<p>No checklist items.</p>:selected.checklist.map(item=><div key={item.id} style={event}><div style={{flex:1}}><b>{item.completedAt?'✓':'○'} {item.label}</b>{item.note?<><br/><small>{item.note}</small></>:null}{canManage&&<input aria-label={`Checklist note for ${item.label}`} placeholder="Operational note (optional)" value={checklistNotes[item.id]??''} onChange={e=>setChecklistNotes(current=>({...current,[item.id]:e.target.value}))} style={smallInput} maxLength={500}/>}</div>{canManage&&<button disabled={busy} onClick={()=>void checklist(item)} style={item.completedAt?secondary:button}>{item.completedAt?'Reopen':'Complete'}</button>}</div>)}

   <h3>Documents</h3>
   {canManage&&<form onSubmit={addDocument} style={subpanel}><div style={grid}><label>Document type<select value={docKind} onChange={e=>setDocKind(e.target.value)} style={input}>{['TENANCY_AGREEMENT','ID_PROOF','OWNER_AUTHORIZATION','MOVE_CLEARANCE','OTHER'].map(v=><option key={v}>{v}</option>)}</select></label><label>Document / file reference<input required value={docReference} onChange={e=>setDocReference(e.target.value)} style={input} maxLength={500}/></label></div><label>Note<textarea value={docNote} onChange={e=>setDocNote(e.target.value)} style={input} maxLength={500}/></label><button disabled={busy||!docReference.trim()} style={secondary}>Add reference</button></form>}
   {selected.documents.length===0?<p>No document references.</p>:selected.documents.map(doc=><div key={doc.id} style={event}><div style={{flex:1}}><b>{doc.kind}</b> · {doc.fileReference}<br/><small>{doc.verifiedAt?`Verified ${fmt(doc.verifiedAt)}`:'Awaiting verification'}</small>{doc.note?<><br/><small>{doc.note}</small></>:null}{canManage&&!doc.verifiedAt&&<input aria-label={`Verification note for ${doc.kind}`} placeholder="Verification note (optional)" value={verifyNotes[doc.id]??''} onChange={e=>setVerifyNotes(current=>({...current,[doc.id]:e.target.value}))} style={smallInput} maxLength={500}/>}</div>{canManage&&!doc.verifiedAt&&<button disabled={busy} onClick={()=>void verifyDocument(doc)} style={button}>Verify</button>}</div>)}

   {canManage&&selected.status==='REQUESTED'&&<section style={subpanel}><h3>Review decision</h3><label>Review note<textarea value={reviewNote} onChange={e=>setReviewNote(e.target.value)} style={input} maxLength={500}/></label><div style={row}><button disabled={busy} onClick={()=>void review('approve')} style={button}>Approve</button><button disabled={busy} onClick={()=>void review('reject')} style={danger}>Reject</button></div></section>}
   {canManage&&selected.status==='APPROVED'&&<button disabled={busy||new Date(selected.effectiveAt).getTime()>Date.now()||readiness<total} onClick={()=>void complete()} style={button}>Complete effective move</button>}

   <h3>Audit trail</h3>{selected.events.map(ev=><div key={ev.id} style={event}><span><b>{ev.eventType}</b>{ev.note?` · ${ev.note}`:''}</span><small>{fmt(ev.createdAt)}</small></div>)}
  </section>}
 </main>
}

const panel={background:'white',border:'1px solid #e5e7eb',borderRadius:16,padding:18,marginTop:18,display:'grid',gap:12} as const
const subpanel={background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:12,padding:14,display:'grid',gap:10} as const
const grid={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:16} as const
const input={display:'block',width:'100%',padding:'10px 12px',border:'1px solid #d1d5db',borderRadius:9,marginTop:5,boxSizing:'border-box',font:'inherit'} as const
const smallInput={display:'block',width:'100%',padding:'8px 10px',border:'1px solid #d1d5db',borderRadius:8,marginTop:8,boxSizing:'border-box'} as const
const button={padding:'10px 14px',border:0,borderRadius:9,background:'#111827',color:'white',fontWeight:700,cursor:'pointer'} as const
const secondary={...button,background:'#475569'},danger={...button,background:'#991b1b'}
const row={display:'flex',gap:12,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap'} as const
const itemButton={width:'100%',display:'flex',justifyContent:'space-between',alignItems:'center',textAlign:'left',padding:'12px 0',border:0,borderBottom:'1px solid #e5e7eb',background:'transparent',cursor:'pointer'} as const
const details={display:'grid',gridTemplateColumns:'140px 1fr',gap:'8px 12px',margin:0} as const
const event={display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',padding:'9px 0',borderBottom:'1px solid #e5e7eb',flexWrap:'wrap'} as const
const errorBox={padding:12,background:'#fee2e2',borderRadius:10} as const
const successBox={padding:12,background:'#ecfdf5',color:'#065f46',borderRadius:10} as const
const readinessBox={display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',padding:14,background:'#f8fafc',borderRadius:12} as const
