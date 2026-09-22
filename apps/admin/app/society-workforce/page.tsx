'use client'

import { FormEvent,useEffect,useMemo,useState } from 'react'
import { ActionBar, EmptyState, ErrorState, EvidenceGrid, FormField, PageHeader, PageShell, PrimaryButton, SecondaryButton, StatusPill } from '../../components/admin-ui'
import { adminApi, getAdminSession, type AdminSession } from '../../lib/aaraagate-api'

type Gate={id:string;name:string;code:string;active:boolean}
type GateAccess={id:string;gateId:string;active:boolean;gate:Gate}
type Attendance={id:string;workerId:string;checkedInAt:string;checkedOutAt?:string|null;gate:Gate;worker?:{id:string;name:string;role:string;department:string}}
type Worker={
  id:string;name:string;phone:string;role:string;department:string;employer?:string|null;
  verification:'PENDING'|'VERIFIED'|'REJECTED'|'SUSPENDED';active:boolean;
  startDate?:string|null;endDate?:string|null;schedule?:{days?:string[];start?:string;end?:string};gateAccesses:GateAccess[];attendances:Attendance[];
  leaves?:Leave[]
}
type Leave={id:string;workerId:string;startsOn:string;endsOn:string;reason?:string|null;active:boolean;worker?:{name:string}}
type TimelineEvent={id:string;event:string;reason?:string|null;details?:Record<string,unknown>;occurredAt:string}
type Summary={
  active:number;pendingVerification:number;suspended:number;inside:number;onLeave:number;expectedNow:number;
  expectedNowNotInside:{id:string;name:string;role:string;department:string}[];
  longOpenAttendance:{workerId:string;name:string;checkedInAt:string}[]
}

const readRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER','COMMITTEE_MEMBER','SECURITY_SUPERVISOR','AUDITOR'])
const manageRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER'])
const emptySummary:Summary={active:0,pendingVerification:0,suspended:0,inside:0,onLeave:0,expectedNow:0,expectedNowNotInside:[],longOpenAttendance:[]}

export default function SocietyWorkforcePage(){
  const[session,setSession]=useState<AdminSession|null>(null),[workers,setWorkers]=useState<Worker[]>([]),[attendance,setAttendance]=useState<Attendance[]>([]),[leaves,setLeaves]=useState<Leave[]>([]),[summary,setSummary]=useState<Summary>(emptySummary),[gates,setGates]=useState<Gate[]>([])
  const[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const[query,setQuery]=useState(''),[statusFilter,setStatusFilter]=useState('ALL'),[departmentFilter,setDepartmentFilter]=useState('ALL')
  const[name,setName]=useState(''),[phone,setPhone]=useState(''),[role,setRole]=useState('HOUSEKEEPING'),[department,setDepartment]=useState('HOUSEKEEPING'),[employer,setEmployer]=useState('')
  const[gateIds,setGateIds]=useState<string[]>([]),[start,setStart]=useState(''),[end,setEnd]=useState(''),[days,setDays]=useState('MON,TUE,WED,THU,FRI,SAT'),[from,setFrom]=useState('08:00'),[to,setTo]=useState('18:00')
  const[selectedId,setSelectedId]=useState(''),[timeline,setTimeline]=useState<TimelineEvent[]>([])
  const[editRole,setEditRole]=useState(''),[editDepartment,setEditDepartment]=useState(''),[editEmployer,setEditEmployer]=useState(''),[editDays,setEditDays]=useState(''),[editFrom,setEditFrom]=useState(''),[editTo,setEditTo]=useState(''),[editGateIds,setEditGateIds]=useState<string[]>([])
  const[leaveStart,setLeaveStart]=useState(''),[leaveEnd,setLeaveEnd]=useState(''),[leaveReason,setLeaveReason]=useState('')
  const[attWorker,setAttWorker]=useState(''),[attGate,setAttGate]=useState(''),[attFrom,setAttFrom]=useState(''),[attTo,setAttTo]=useState(''),[insideOnly,setInsideOnly]=useState(false)
  const[correctionId,setCorrectionId]=useState(''),[correctionIn,setCorrectionIn]=useState(''),[correctionOut,setCorrectionOut]=useState(''),[correctionReason,setCorrectionReason]=useState('')

  const canRead=!!session&&readRoles.has(session.role)
  const canManage=!!session&&manageRoles.has(session.role)
  const selectedWorker=workers.find(w=>w.id===selectedId)
  const departments=useMemo(()=>[...new Set(workers.map(w=>w.department))].sort(),[workers])
  const filteredWorkers=useMemo(()=>{
    const q=query.trim().toLowerCase()
    return workers.filter(w=>{
      if(statusFilter!=='ALL'&&w.verification!==statusFilter)return false
      if(departmentFilter!=='ALL'&&w.department!==departmentFilter)return false
      if(!q)return true
      return [w.name,w.phone,w.role,w.department,w.employer??''].some(v=>v.toLowerCase().includes(q))
    })
  },[workers,query,statusFilter,departmentFilter])

  async function load(s:AdminSession){
    setLoading(true);setError('')
    try{
      const[w,a,l,sm]=await Promise.all([
        adminApi<Worker[]>(s,'/society-workforce'),
        adminApi<Attendance[]>(s,'/society-workforce/attendance'),
        adminApi<Leave[]>(s,'/society-workforce/leaves'),
        adminApi<Summary>(s,'/society-workforce/summary'),
      ])
      setWorkers(w);setAttendance(a);setLeaves(l);setSummary(sm)
      if(manageRoles.has(s.role)){
        const g=await adminApi<Gate[]>(s,'/gates')
        const activeGates=g.filter(x=>x.active);setGates(activeGates)
        if(gateIds.length===0)setGateIds(activeGates.slice(0,1).map(x=>x.id))
      }else setGates([])
      if(selectedId&&w.some(x=>x.id===selectedId))await loadTimeline(s,selectedId)
    }catch(e){setError(e instanceof Error?e.message:'Could not load society workforce')}finally{setLoading(false)}
  }

  useEffect(()=>{const s=getAdminSession();setSession(s);if(s&&readRoles.has(s.role))void load(s);else setLoading(false)},[])

  async function loadTimeline(s:AdminSession,workerId:string){
    try{setTimeline(await adminApi<TimelineEvent[]>(s,`/society-workforce/${workerId}/timeline`))}catch{setTimeline([])}
  }

  async function create(e:FormEvent){
    e.preventDefault();if(!session||!canManage)return
    setBusy(true);setError('');setNotice('')
    try{
      await adminApi(session,'/society-workforce',{method:'POST',body:JSON.stringify({
        name:name.trim(),phone:phone.trim(),role:role.trim(),department:department.trim(),employer:employer.trim()||undefined,gateIds,
        schedule:{days:days.split(',').map(v=>v.trim().toUpperCase()).filter(Boolean),start:from,end:to},
        startDate:start?new Date(start).toISOString():undefined,endDate:end?new Date(end).toISOString():undefined,
      })})
      setName('');setPhone('');setEmployer('');setNotice('Society worker added for verification.');await load(session)
    }catch(e){setError(e instanceof Error?e.message:'Could not add society worker')}finally{setBusy(false)}
  }

  async function action(worker:Worker,kind:'verify'|'reject'|'suspend'|'reactivate'){
    if(!session||!canManage)return
    setBusy(true);setError('');setNotice('')
    try{
      await adminApi(session,`/society-workforce/${worker.id}/${kind}`,{method:'PATCH',body:JSON.stringify({})})
      setNotice(kind==='verify'?'Worker verified for assigned gates.':kind==='reject'?'Worker rejected.':kind==='suspend'?'Worker suspended from gate access.':'Worker reactivated.')
      await load(session)
    }catch(e){setError(e instanceof Error?e.message:'Could not update society worker')}finally{setBusy(false)}
  }

  function selectWorker(w:Worker){
    setSelectedId(w.id);setEditRole(w.role);setEditDepartment(w.department);setEditEmployer(w.employer??'')
    setEditDays((w.schedule?.days??[]).join(','));setEditFrom(w.schedule?.start??'08:00');setEditTo(w.schedule?.end??'18:00')
    setEditGateIds(w.gateAccesses.map(a=>a.gateId));setLeaveStart('');setLeaveEnd('');setLeaveReason('')
    if(session)void loadTimeline(session,w.id)
  }

  async function saveConfiguration(){
    if(!session||!selectedWorker||!canManage)return
    setBusy(true);setError('');setNotice('')
    try{
      await adminApi(session,`/society-workforce/${selectedWorker.id}/configure`,{method:'PATCH',body:JSON.stringify({
        role:editRole.trim(),department:editDepartment.trim(),employer:editEmployer.trim()||null,gateIds:editGateIds,
        schedule:{days:editDays.split(',').map(v=>v.trim().toUpperCase()).filter(Boolean),start:editFrom,end:editTo},
      })})
      setNotice('Worker role, department, shift and gate access updated.');await load(session)
    }catch(e){setError(e instanceof Error?e.message:'Could not update worker configuration')}finally{setBusy(false)}
  }

  async function addLeave(){
    if(!session||!selectedWorker||!canManage||!leaveStart||!leaveEnd)return
    setBusy(true);setError('');setNotice('')
    try{
      await adminApi(session,`/society-workforce/${selectedWorker.id}/leaves`,{method:'POST',body:JSON.stringify({startsOn:leaveStart,endsOn:leaveEnd,reason:leaveReason.trim()||undefined})})
      setNotice('Leave added. Gate eligibility will be blocked for the leave dates.');setLeaveStart('');setLeaveEnd('');setLeaveReason('');await load(session)
    }catch(e){setError(e instanceof Error?e.message:'Could not add workforce leave')}finally{setBusy(false)}
  }

  async function cancelLeave(leave:Leave){
    if(!session||!canManage)return
    setBusy(true);setError('')
    try{await adminApi(session,`/society-workforce/leaves/${leave.id}/cancel`,{method:'PATCH',body:JSON.stringify({reason:'Cancelled by society operations'})});setNotice('Leave cancelled.');await load(session)}
    catch(e){setError(e instanceof Error?e.message:'Could not cancel leave')}finally{setBusy(false)}
  }

  async function applyAttendance(){
    if(!session)return
    const p=new URLSearchParams()
    if(attWorker)p.set('workerId',attWorker);if(attGate)p.set('gateId',attGate)
    if(attFrom)p.set('from',new Date(`${attFrom}T00:00:00`).toISOString())
    if(attTo)p.set('to',new Date(`${attTo}T23:59:59`).toISOString())
    if(insideOnly)p.set('insideOnly','true')
    setBusy(true);setError('')
    try{setAttendance(await adminApi<Attendance[]>(session,`/society-workforce/attendance?${p.toString()}`))}
    catch(e){setError(e instanceof Error?e.message:'Could not filter attendance')}finally{setBusy(false)}
  }

  function exportAttendance(){
    const esc=(v:unknown)=>`"${String(v??'').replaceAll('"','""')}"`
    const csv=['Worker,Role,Department,Gate,Check in,Check out',...attendance.map(a=>[a.worker?.name,a.worker?.role,a.worker?.department,a.gate.name,a.checkedInAt,a.checkedOutAt??''].map(esc).join(','))].join('\n')
    const href=URL.createObjectURL(new Blob([csv+'\n'],{type:'text/csv;charset=utf-8'}))
    try{const link=document.createElement('a');link.href=href;link.download=`aaraagate-society-workforce-attendance-${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(link);link.click();link.remove()}finally{URL.revokeObjectURL(href)}
  }

  function openCorrection(a:Attendance){
    setCorrectionId(a.id)
    setCorrectionIn(new Date(a.checkedInAt).toISOString().slice(0,16))
    setCorrectionOut(a.checkedOutAt?new Date(a.checkedOutAt).toISOString().slice(0,16):'')
    setCorrectionReason('')
  }

  async function saveCorrection(){
    if(!session||!canManage||!correctionId||correctionReason.trim().length<5||!correctionIn)return
    setBusy(true);setError('')
    try{
      await adminApi(session,`/society-workforce/attendance/${correctionId}/correct`,{method:'PATCH',body:JSON.stringify({
        checkedInAt:new Date(correctionIn).toISOString(),
        ...(correctionOut?{checkedOutAt:new Date(correctionOut).toISOString()}:{}),
        reason:correctionReason.trim(),
      })})
      setCorrectionId('');setCorrectionIn('');setCorrectionOut('');setCorrectionReason('')
      setNotice('Attendance corrected with an auditable reason.');await load(session)
    }catch(e){setError(e instanceof Error?e.message:'Could not correct attendance')}finally{setBusy(false)}
  }

  function toggleGate(id:string,setter:(v:string[])=>void,current:string[]){setter(current.includes(id)?current.filter(v=>v!==id):[...current,id])}

  if(!session||!canRead)return <PageShell><PageHeader title="Society workforce access required" description="This area is limited to authorized society operations roles." actions={<a href="/">Return to Admin</a>}/></PageShell>

  const selectedLeaves=selectedWorker?leaves.filter(l=>l.workerId===selectedWorker.id):[]

  return <PageShell>
    <PageHeader context={`${session.societyName??'Current society'} · ${session.role.replaceAll('_',' ')}`} title="Society workforce" description="Manage common-area staff, shifts, leave, gate eligibility and auditable attendance. Residents do not manage this roster." actions={<a href="/">← Operations</a>}/>
    {error&&<ErrorState title="Society workforce operation failed" description={error}/>}
    <ActionBar feedback={notice} label="Society workforce actions"><SecondaryButton loading={loading||busy} onClick={()=>void load(session)}>Refresh</SecondaryButton></ActionBar>

    <section style={grid}>
      <div style={panel}><h2>Operations snapshot</h2><EvidenceGrid items={[
        {id:'active',label:'Active roster',value:summary.active},{id:'inside',label:'Inside now',value:summary.inside},{id:'leave',label:'On leave today',value:summary.onLeave},
        {id:'expected',label:'Expected now',value:summary.expectedNow},{id:'pending',label:'Pending verification',value:summary.pendingVerification},{id:'suspended',label:'Suspended',value:summary.suspended},
      ]}/>
        {summary.expectedNowNotInside.length>0&&<div style={warning}><b>Expected now, not currently inside</b><div>{summary.expectedNowNotInside.slice(0,8).map(x=>x.name).join(', ')}</div><small>This is a descriptive schedule state, not an automatic absence finding.</small></div>}
        {summary.longOpenAttendance.length>0&&<div style={danger}><b>Long-open attendance needs review</b>{summary.longOpenAttendance.map(x=><div key={x.workerId}>{x.name} · since {new Date(x.checkedInAt).toLocaleString('en-IN')}</div>)}</div>}
      </div>

      {canManage&&<form onSubmit={create} style={panel}><h2>Add common worker</h2>
        <FormField label="Worker name" required value={name} onChange={e=>setName(e.target.value)} placeholder="Worker full name"/>
        <FormField label="Mobile number" required value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+91…"/>
        <FormField label="Role" required value={role} onChange={e=>setRole(e.target.value)} placeholder="HOUSEKEEPING / GARDENER / TECHNICIAN"/>
        <FormField label="Department" required value={department} onChange={e=>setDepartment(e.target.value)} placeholder="HOUSEKEEPING / MAINTENANCE"/>
        <FormField label="Employer / contractor" value={employer} onChange={e=>setEmployer(e.target.value)} placeholder="Optional"/>
        <div style={fieldGroup}><b>Allowed gates</b>{gates.length===0?<small>No active gates configured.</small>:gates.map(g=><label key={g.id} style={check}><input type="checkbox" checked={gateIds.includes(g.id)} onChange={()=>toggleGate(g.id,setGateIds,gateIds)}/><span>{g.name} · {g.code}</span></label>)}</div>
        <FormField label="Working days" value={days} onChange={e=>setDays(e.target.value)} hint="Comma-separated: MON,TUE,WED…"/>
        <div style={two}><FormField label="Shift starts" type="time" value={from} onChange={e=>setFrom(e.target.value)}/><FormField label="Shift ends" type="time" value={to} onChange={e=>setTo(e.target.value)}/></div>
        <div style={two}><FormField label="Effective from" type="date" value={start} onChange={e=>setStart(e.target.value)}/><FormField label="Effective until" type="date" value={end} onChange={e=>setEnd(e.target.value)}/></div>
        <PrimaryButton type="submit" loading={busy} disabled={gateIds.length===0}>Add for verification</PrimaryButton>
      </form>}
    </section>

    <section style={panelSection}><h2>Common worker roster</h2>
      <div style={filters}>
        <FormField label="Search workforce" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Name, phone, role, department or contractor"/>
        <label style={filterLabel}><span>Verification</span><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={selectStyle}><option value="ALL">All</option><option value="PENDING">Pending</option><option value="VERIFIED">Verified</option><option value="SUSPENDED">Suspended</option><option value="REJECTED">Rejected</option></select></label>
        <label style={filterLabel}><span>Department</span><select value={departmentFilter} onChange={e=>setDepartmentFilter(e.target.value)} style={selectStyle}><option value="ALL">All</option>{departments.map(d=><option key={d} value={d}>{d.replaceAll('_',' ')}</option>)}</select></label>
      </div>
      {loading?<p>Loading workforce…</p>:workers.length===0?<EmptyState title="No society workforce registered" description="Add common-area workers such as housekeeping, gardening, maintenance or clubhouse staff."/>:filteredWorkers.length===0?<EmptyState title="No workforce matches the current filters"/>:filteredWorkers.map(w=>{
        const inside=w.attendances?.find(a=>!a.checkedOutAt),onLeave=(w.leaves?.length??0)>0
        const tone=w.verification==='VERIFIED'?'success':w.verification==='SUSPENDED'||w.verification==='REJECTED'?'danger':'warning'
        return <article key={w.id} style={item}><div style={{minWidth:0}}><div style={rowWrap}><b>{w.name}</b><StatusPill label={w.verification} tone={tone}/>{inside&&<StatusPill label="INSIDE" tone="info"/>}{onLeave&&<StatusPill label="ON LEAVE" tone="warning"/>}</div><div>{w.role.replaceAll('_',' ')} · {w.department.replaceAll('_',' ')}</div><small>{w.phone}{w.employer?` · ${w.employer}`:''}</small><br/><small>Gate access: {w.gateAccesses.length?w.gateAccesses.map(a=>a.gate.name).join(', '):'None assigned'}{inside?` · entered via ${inside.gate.name} at ${new Date(inside.checkedInAt).toLocaleString('en-IN')}`:''}</small>{w.schedule&&<><br/><small>Shift: {(w.schedule.days??[]).join(', ')||'All days'} · {w.schedule.start??'Any time'}–{w.schedule.end??'Any time'}</small></>}</div>
        <div style={rowWrap}><SecondaryButton onClick={()=>selectWorker(w)}>Operations</SecondaryButton>{canManage&&<>{w.verification==='PENDING'&&<><PrimaryButton disabled={busy} onClick={()=>void action(w,'verify')}>Verify</PrimaryButton><SecondaryButton disabled={busy} onClick={()=>void action(w,'reject')}>Reject</SecondaryButton></>}{w.verification==='VERIFIED'&&w.active&&<SecondaryButton disabled={busy||!!inside} onClick={()=>void action(w,'suspend')}>Suspend</SecondaryButton>}{w.verification==='SUSPENDED'&&<PrimaryButton disabled={busy} onClick={()=>void action(w,'reactivate')}>Reactivate</PrimaryButton>}</>}</div></article>
      })}</section>

    {selectedWorker&&<section style={panelSection}><div style={rowWrap}><h2 style={{marginRight:'auto'}}>Worker operations · {selectedWorker.name}</h2><SecondaryButton onClick={()=>{setSelectedId('');setTimeline([])}}>Close</SecondaryButton></div>
      {canManage&&<div style={grid}>
        <div><h3>Role, shift & gate access</h3><FormField label="Role" value={editRole} onChange={e=>setEditRole(e.target.value)}/><FormField label="Department" value={editDepartment} onChange={e=>setEditDepartment(e.target.value)}/><FormField label="Employer / contractor" value={editEmployer} onChange={e=>setEditEmployer(e.target.value)}/><FormField label="Working days" value={editDays} onChange={e=>setEditDays(e.target.value)}/><div style={two}><FormField label="Shift starts" type="time" value={editFrom} onChange={e=>setEditFrom(e.target.value)}/><FormField label="Shift ends" type="time" value={editTo} onChange={e=>setEditTo(e.target.value)}/></div><div style={fieldGroup}><b>Allowed gates</b>{gates.map(g=><label key={g.id} style={check}><input type="checkbox" checked={editGateIds.includes(g.id)} onChange={()=>toggleGate(g.id,setEditGateIds,editGateIds)}/><span>{g.name}</span></label>)}</div><PrimaryButton disabled={busy||editGateIds.length===0} onClick={()=>void saveConfiguration()}>Save worker configuration</PrimaryButton></div>
        <div><h3>Leave / absence</h3><div style={two}><FormField label="Leave starts" type="date" value={leaveStart} onChange={e=>setLeaveStart(e.target.value)}/><FormField label="Leave ends" type="date" value={leaveEnd} onChange={e=>setLeaveEnd(e.target.value)}/></div><FormField label="Reason" value={leaveReason} onChange={e=>setLeaveReason(e.target.value)} placeholder="Optional"/><PrimaryButton disabled={busy||!leaveStart||!leaveEnd} onClick={()=>void addLeave()}>Add leave</PrimaryButton><div style={{marginTop:12}}>{selectedLeaves.length===0?<small>No leave history.</small>:selectedLeaves.slice(0,8).map(l=><div key={l.id} style={miniRow}><span>{new Date(l.startsOn).toLocaleDateString('en-IN')} → {new Date(l.endsOn).toLocaleDateString('en-IN')}{l.reason?` · ${l.reason}`:''}</span><StatusPill label={l.active?'ACTIVE':'CANCELLED'} tone={l.active?'warning':'neutral'}/>{l.active&&<SecondaryButton disabled={busy} onClick={()=>void cancelLeave(l)}>Cancel</SecondaryButton>}</div>)}</div></div>
      </div>}
      <h3>Lifecycle timeline</h3>{timeline.length===0?<EmptyState title="No lifecycle events recorded yet"/>:timeline.slice(0,30).map(e=><div key={e.id} style={timelineRow}><div><b>{e.event.replaceAll('_',' ')}</b>{e.reason&&<span> · {e.reason}</span>}</div><small>{new Date(e.occurredAt).toLocaleString('en-IN')}</small></div>)}
    </section>}

    <section style={panelSection}><div style={rowWrap}><h2 style={{marginRight:'auto'}}>Gate attendance</h2><SecondaryButton onClick={exportAttendance}>Export CSV</SecondaryButton></div>
      <div style={attendanceFilters}>
        <label style={filterLabel}><span>Worker</span><select value={attWorker} onChange={e=>setAttWorker(e.target.value)} style={selectStyle}><option value="">All workers</option>{workers.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        <label style={filterLabel}><span>Gate</span><select value={attGate} onChange={e=>setAttGate(e.target.value)} style={selectStyle}><option value="">All gates</option>{gates.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
        <FormField label="From" type="date" value={attFrom} onChange={e=>setAttFrom(e.target.value)}/><FormField label="To" type="date" value={attTo} onChange={e=>setAttTo(e.target.value)}/>
        <label style={check}><input type="checkbox" checked={insideOnly} onChange={e=>setInsideOnly(e.target.checked)}/><span>Inside only</span></label><PrimaryButton disabled={busy} onClick={()=>void applyAttendance()}>Apply</PrimaryButton>
      </div>
      {correctionId&&canManage&&<div style={correctionPanel}><div style={rowWrap}><b>Attendance correction</b><span>Supervisor reason is mandatory and will be written to the worker timeline.</span></div><div style={attendanceFilters}><FormField label="Check-in" type="datetime-local" value={correctionIn} onChange={e=>setCorrectionIn(e.target.value)}/><FormField label="Check-out" type="datetime-local" value={correctionOut} onChange={e=>setCorrectionOut(e.target.value)}/><FormField label="Correction reason" required value={correctionReason} onChange={e=>setCorrectionReason(e.target.value)} placeholder="Minimum 5 characters"/><PrimaryButton disabled={busy||correctionReason.trim().length<5||!correctionIn} onClick={()=>void saveCorrection()}>Save correction</PrimaryButton><SecondaryButton disabled={busy} onClick={()=>{setCorrectionId('');setCorrectionReason('')}}>Cancel</SecondaryButton></div></div>}
      {attendance.length===0?<EmptyState title="No society workforce attendance recorded"/>:attendance.slice(0,100).map(a=><article key={a.id} style={item}><div><b>{a.worker?.name??'Society worker'}</b><br/><small>{a.worker?.role?.replaceAll('_',' ')??'Worker'} · {a.worker?.department?.replaceAll('_',' ')??''} · {a.gate.name}</small></div><div style={{textAlign:'right'}}><StatusPill label={a.checkedOutAt?'CHECKED OUT':'INSIDE'} tone={a.checkedOutAt?'neutral':'info'}/><br/><small>In {new Date(a.checkedInAt).toLocaleString('en-IN')}{a.checkedOutAt?` · Out ${new Date(a.checkedOutAt).toLocaleString('en-IN')}`:''}</small>{canManage&&<><br/><SecondaryButton disabled={busy} onClick={()=>openCorrection(a)}>Correct with reason</SecondaryButton></>}</div></article>)}</section>
  </PageShell>
}

const panel={background:'#fff',border:'1px solid #e5e7eb',borderRadius:18,padding:20,boxShadow:'0 8px 24px rgba(15,23,42,.05)'}
const panelSection={...panel,marginTop:18}
const grid={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,380px),1fr))',gap:18,marginTop:18}
const item={display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:16,padding:'16px 0',borderBottom:'1px solid #eef2f7',flexWrap:'wrap' as const}
const rowWrap={display:'flex',gap:8,alignItems:'center',flexWrap:'wrap' as const}
const two={display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:10}
const fieldGroup={display:'grid',gap:7,margin:'12px 0'}
const check={display:'flex',gap:8,alignItems:'center'}
const filters={display:'grid',gridTemplateColumns:'minmax(0,2fr) repeat(2,minmax(190px,1fr))',gap:12,alignItems:'end',margin:'12px 0 18px'}
const attendanceFilters={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,alignItems:'end',margin:'12px 0 18px'}
const filterLabel={display:'grid',gap:6,fontSize:14,fontWeight:600}
const selectStyle={minHeight:42,border:'1px solid #cbd5e1',borderRadius:10,padding:'0 10px',background:'#fff'}
const miniRow={display:'flex',alignItems:'center',gap:8,flexWrap:'wrap' as const,padding:'8px 0',borderBottom:'1px solid #eef2f7'}
const timelineRow={display:'flex',justifyContent:'space-between',gap:12,padding:'10px 0',borderBottom:'1px solid #eef2f7',flexWrap:'wrap' as const}
const warning={marginTop:14,padding:12,borderRadius:12,background:'#fff7ed'}
const danger={marginTop:10,padding:12,borderRadius:12,background:'#fef2f2'}
const correctionPanel={margin:'12px 0',padding:14,borderRadius:14,border:'1px solid #cbd5e1',background:'#f8fafc'}
