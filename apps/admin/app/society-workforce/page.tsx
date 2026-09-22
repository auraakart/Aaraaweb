'use client'

import { FormEvent,useEffect,useMemo,useState } from 'react'
import { ActionBar, EmptyState, ErrorState, EvidenceGrid, FormField, PageHeader, PageShell, PrimaryButton, SecondaryButton, SelectField, StatusPill } from '../../components/admin-ui'
import { adminApi, getAdminSession, type AdminSession } from '../../lib/aaraagate-api'

type Gate={id:string;name:string;code:string;active:boolean}
type GateAccess={id:string;gateId:string;active:boolean;gate:Gate}
type Attendance={id:string;checkedInAt:string;checkedOutAt?:string|null;gate:Gate}
type Worker={
  id:string;name:string;phone:string;role:string;department:string;employer?:string|null;
  verification:'PENDING'|'VERIFIED'|'REJECTED'|'SUSPENDED';active:boolean;
  startDate?:string|null;endDate?:string|null;gateAccesses:GateAccess[];attendances:Attendance[]
}

const readRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER','COMMITTEE_MEMBER','SECURITY_SUPERVISOR','AUDITOR'])
const manageRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER'])

export default function SocietyWorkforcePage(){
  const[session,setSession]=useState<AdminSession|null>(null),[workers,setWorkers]=useState<Worker[]>([]),[gates,setGates]=useState<Gate[]>([])
  const[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const[name,setName]=useState(''),[phone,setPhone]=useState(''),[role,setRole]=useState('HOUSEKEEPING'),[department,setDepartment]=useState('HOUSEKEEPING'),[employer,setEmployer]=useState('')
  const[gateIds,setGateIds]=useState<string[]>([]),[start,setStart]=useState(''),[end,setEnd]=useState(''),[days,setDays]=useState('MON,TUE,WED,THU,FRI,SAT'),[from,setFrom]=useState('08:00'),[to,setTo]=useState('18:00')

  const canRead=!!session&&readRoles.has(session.role)
  const canManage=!!session&&manageRoles.has(session.role)
  const present=useMemo(()=>workers.filter(w=>w.attendances?.some(a=>!a.checkedOutAt)).length,[workers])
  const pending=useMemo(()=>workers.filter(w=>w.verification==='PENDING').length,[workers])

  async function load(s:AdminSession){
    setLoading(true);setError('')
    try{
      const[w,g]=await Promise.all([
        adminApi<Worker[]>(s,'/society-workforce'),
        adminApi<Gate[]>(s,'/gates'),
      ])
      setWorkers(w);setGates(g.filter(x=>x.active));if(gateIds.length===0)setGateIds(g.filter(x=>x.active).slice(0,1).map(x=>x.id))
    }catch(e){setError(e instanceof Error?e.message:'Could not load society workforce')}finally{setLoading(false)}
  }

  useEffect(()=>{const s=getAdminSession();setSession(s);if(s&&readRoles.has(s.role))void load(s);else setLoading(false)},[])

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
      await adminApi(session,`/society-workforce/${worker.id}/${kind}`,{method:'PATCH',body:'{}'})
      setNotice(kind==='verify'?'Worker verified for assigned gates.':kind==='reject'?'Worker rejected.':kind==='suspend'?'Worker suspended from gate access.':'Worker reactivated.')
      await load(session)
    }catch(e){setError(e instanceof Error?e.message:'Could not update society worker')}finally{setBusy(false)}
  }

  function toggleGate(id:string){setGateIds(x=>x.includes(id)?x.filter(v=>v!==id):[...x,id])}

  if(!session||!canRead)return <PageShell><PageHeader title="Society workforce access required" description="This area is limited to authorized society operations roles." actions={<a href="/">Return to Admin</a>}/></PageShell>

  return <PageShell>
    <PageHeader context={`${session.societyName??'Current society'} · ${session.role.replaceAll('_',' ')}`} title="Society workforce" description="Manage common-area staff, verification, shifts, assigned gates and attendance. Residents do not manage this roster." actions={<a href="/">← Operations</a>}/>
    {error&&<ErrorState title="Society workforce operation failed" description={error}/>}
    <ActionBar feedback={notice} label="Society workforce actions"><SecondaryButton loading={loading||busy} onClick={()=>void load(session)}>Refresh</SecondaryButton></ActionBar>
    <section style={grid}>
      <div style={panel}><h2>Workforce summary</h2><EvidenceGrid items={[{id:'total',label:'Active roster',value:workers.filter(w=>w.active).length},{id:'pending',label:'Pending verification',value:pending},{id:'present',label:'Currently inside',value:present}]}/></div>
      {canManage&&<form onSubmit={create} style={panel}><h2>Add common worker</h2>
        <FormField label="Worker name" required value={name} onChange={e=>setName(e.target.value)} placeholder="Lakshmi R."/>
        <FormField label="Mobile number" required value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+91…"/>
        <FormField label="Role" required value={role} onChange={e=>setRole(e.target.value)} placeholder="HOUSEKEEPING / GARDENER / TECHNICIAN"/>
        <FormField label="Department" required value={department} onChange={e=>setDepartment(e.target.value)} placeholder="HOUSEKEEPING / MAINTENANCE"/>
        <FormField label="Employer / contractor" value={employer} onChange={e=>setEmployer(e.target.value)} placeholder="Optional"/>
        <div style={fieldGroup}><b>Allowed gates</b>{gates.length===0?<small>No active gates configured.</small>:gates.map(g=><label key={g.id} style={check}><input type="checkbox" checked={gateIds.includes(g.id)} onChange={()=>toggleGate(g.id)}/><span>{g.name} · {g.code}</span></label>)}</div>
        <FormField label="Working days" value={days} onChange={e=>setDays(e.target.value)} hint="Comma-separated: MON,TUE,WED…"/>
        <div style={two}><FormField label="Shift starts" type="time" value={from} onChange={e=>setFrom(e.target.value)}/><FormField label="Shift ends" type="time" value={to} onChange={e=>setTo(e.target.value)}/></div>
        <div style={two}><FormField label="Effective from" type="date" value={start} onChange={e=>setStart(e.target.value)}/><FormField label="Effective until" type="date" value={end} onChange={e=>setEnd(e.target.value)}/></div>
        <PrimaryButton type="submit" loading={busy} disabled={gateIds.length===0}>Add for verification</PrimaryButton>
      </form>}
    </section>
    <section style={panelSection}><h2>Common worker roster</h2>{loading?<p>Loading workforce…</p>:workers.length===0?<EmptyState title="No society workforce registered" description="Add common-area workers such as housekeeping, gardening, maintenance or clubhouse staff."/>:workers.map(w=>{
      const inside=w.attendances?.find(a=>!a.checkedOutAt)
      const tone=w.verification==='VERIFIED'?'success':w.verification==='SUSPENDED'||w.verification==='REJECTED'?'danger':'warning'
      return <article key={w.id} style={item}><div style={{minWidth:0}}><div style={rowWrap}><b>{w.name}</b><StatusPill label={w.verification} tone={tone}/>{inside&&<StatusPill label="INSIDE" tone="info"/>}</div><div>{w.role.replaceAll('_',' ')} · {w.department.replaceAll('_',' ')}</div><small>{w.phone}{w.employer?` · ${w.employer}`:''}</small><br/><small>Gate access: {w.gateAccesses.length?w.gateAccesses.map(a=>a.gate.name).join(', '):'None assigned'}{inside?` · entered via ${inside.gate.name} at ${new Date(inside.checkedInAt).toLocaleString('en-IN')}`:''}</small></div>
      {canManage&&<div style={rowWrap}>{w.verification==='PENDING'&&<><PrimaryButton disabled={busy} onClick={()=>void action(w,'verify')}>Verify</PrimaryButton><SecondaryButton disabled={busy} onClick={()=>void action(w,'reject')}>Reject</SecondaryButton></>}{w.verification==='VERIFIED'&&w.active&&<SecondaryButton disabled={busy||!!inside} onClick={()=>void action(w,'suspend')}>Suspend</SecondaryButton>}{w.verification==='SUSPENDED'&&<PrimaryButton disabled={busy} onClick={()=>void action(w,'reactivate')}>Reactivate</PrimaryButton>}</div>}</article>
    })}</section>
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
