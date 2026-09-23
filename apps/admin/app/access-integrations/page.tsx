'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, ArrowLeft, RefreshCw, ShieldCheck } from 'lucide-react'
import { api, type Session } from '../../lib/admin-client'

type Adapter={kind:'ANPR'|'BOOM_BARRIER'|'RFID';health:'ONLINE'|'DEGRADED'|'OFFLINE';lastSeenAt:string;message?:string}
type Device={id:string;gateId:string;gateName:string;adapterKind:string;deviceKey:string;displayName:string;active:boolean;health:'ONLINE'|'DEGRADED'|'OFFLINE';lastHealthAt?:string|null;lastSeenAt?:string|null}
type Compatibility={target:string;requiredCapabilities:string[];transportOwnedByAdapter:true;directDatabaseAccessAllowed:false;commandsRequireIdempotency:true;eventsRequireExternalDeduplicationKey:true;manualFallbackRequired:true}
type Command={id:string;actorUserId:string;idempotencyKey:string;command:string;status:string;result?:unknown;createdAt:string;completedAt?:string|null}

const manageRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN'])

function currentSession():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw) as Session:null}catch{return null}}

export default function AccessIntegrationsPage(){
  const[session,setSession]=useState<Session|null>(null),[adapters,setAdapters]=useState<Adapter[]>([]),[devices,setDevices]=useState<Device[]>([]),[compatibility,setCompatibility]=useState<Compatibility[]>([]),[commands,setCommands]=useState<Record<string,Command[]>>({}),[loading,setLoading]=useState(true),[error,setError]=useState('')
  const canManage=useMemo(()=>!!session&&manageRoles.has(session.role),[session])
  const readiness=useMemo(()=>adapters.map(adapter=>{
    const mapped=devices.filter(device=>device.adapterKind===adapter.kind&&device.active)
    const unhealthy=mapped.filter(device=>device.health!=='ONLINE')
    return{kind:adapter.kind,mapped:mapped.length,unhealthy:unhealthy.length,configured:mapped.length>0,ready:mapped.length>0&&adapter.health==='ONLINE'&&unhealthy.length===0,health:adapter.health}
  }),[adapters,devices])
  const configuredAdapters=readiness.filter(item=>item.configured)
  const readyAdapters=configuredAdapters.filter(item=>item.ready)
  const integrationState=configuredAdapters.length===0?'MANUAL ONLY':readyAdapters.length===configuredAdapters.length?'ADAPTER READY':'ATTENTION REQUIRED'

  const load=useCallback(async(s:Session)=>{
    setLoading(true);setError('')
    try{
      const[a,d,c]=await Promise.all([
        api<Adapter[]>('/access-integrations/adapters',{},s),
        api<Device[]>('/access-integrations/devices',{},s),
        api<Compatibility[]>('/access-integrations/compatibility',{},s),
      ])
      setAdapters(a);setDevices(d);setCompatibility(c)
      const history=await Promise.all(d.slice(0,12).map(async device=>[device.id,await api<Command[]>(`/access-integrations/devices/${device.id}/commands`,{},s)] as const))
      setCommands(Object.fromEntries(history))
    }catch(e){setError(e instanceof Error?e.message:'Access integrations could not be loaded')}
    finally{setLoading(false)}
  },[])

  useEffect(()=>{const s=currentSession();setSession(s);if(s)void load(s);else{setError('Sign in to the Admin console first.');setLoading(false)}},[load])

  async function refreshDevice(device:Device){
    if(!session||!canManage)return
    setError('')
    try{await api(`/access-integrations/devices/${device.id}/refresh-health`,{method:'POST'},session);await load(session)}
    catch(e){setError(e instanceof Error?e.message:'Device health could not be refreshed')}
  }

  if(!session&&!loading)return <main style={{padding:32}}><h1>Access integrations unavailable</h1><p>{error}</p><a href="/">Return to Admin</a></main>

  return <main style={{maxWidth:1180,margin:'0 auto',padding:'28px 22px 80px'}}>
    <header><a href="/" style={{display:'inline-flex',gap:6,alignItems:'center'}}><ArrowLeft size={16} aria-hidden="true"/>Back to operations</a><div style={{display:'flex',justifyContent:'space-between',gap:20,alignItems:'start',marginTop:14,flexWrap:'wrap'}}><div><small>{session?.societyName??'Current society'} · {session?.role.replaceAll('_',' ')}</small><h1 style={{marginBottom:8}}>Access integrations</h1><p style={{maxWidth:760}}>Vendor-neutral ANPR, boom-barrier and RFID health with manual gate fallback preserved independently of hardware availability.</p></div><span style={pill}><ShieldCheck size={16} aria-hidden="true"/>Manual fallback protected</span></div></header>
    {error&&<div role="alert" style={errorBox}>{error}</div>}
    <section style={panel} aria-labelledby="integration-readiness">
      <div style={toolbar}><div><h2 id="integration-readiness">Integration readiness</h2><p style={muted}>Repository readiness combines adapter health, active device mappings and device health. Manual gate fallback remains available regardless of adapter state.</p></div><span style={integrationState==='ADAPTER READY'?readyPill:integrationState==='MANUAL ONLY'?neutralPill:warningPill}>{integrationState}</span></div>
      <div style={grid}>{readiness.map(item=><article key={item.kind} style={metric}><strong>{item.kind.replaceAll('_',' ')}</strong><span>{item.configured?(item.ready?'Ready':'Needs attention'):'Not mapped'}</span><small>{item.mapped} active device{item.mapped===1?'':'s'} · {item.unhealthy} unhealthy · adapter {item.health.toLowerCase()}</small></article>)}</div>
      <div style={readinessNote}><b>Certification boundary</b><span>Ready means the repository contract and simulator/device evidence are healthy. It does not certify a physical vendor installation, network path or production hardware.</span></div>
    </section>
    <section style={panel} aria-labelledby="adapter-health"><div style={toolbar}><div><h2 id="adapter-health">Adapter health</h2><p style={muted}>Simulator/adapter status is operational evidence; it does not imply a production hardware certification.</p></div><button onClick={()=>session&&void load(session)} disabled={loading} style={secondary}><RefreshCw size={16} aria-hidden="true"/>{loading?'Refreshing…':'Refresh'}</button></div><div style={grid}>{adapters.map(adapter=><article key={adapter.kind} style={metric} tabIndex={0} aria-label={`${adapter.kind} adapter ${adapter.health}`}><Activity size={20} aria-hidden="true"/><strong>{adapter.kind.replaceAll('_',' ')}</strong><span>{adapter.health}</span><small>{adapter.message??'Adapter status available'}</small></article>)}</div></section>
    <section style={panel} aria-labelledby="mapped-devices"><h2 id="mapped-devices">Mapped devices</h2>{!loading&&devices.length===0?<div style={empty}>No access devices are mapped yet. Manual gate operations remain available.</div>:<div style={stack}>{devices.map(device=><article key={device.id} style={card}><div><strong>{device.displayName}</strong><div style={muted}>{device.gateName} · {device.adapterKind.replaceAll('_',' ')} · {device.health}</div><small>Last seen: {device.lastSeenAt?new Date(device.lastSeenAt).toLocaleString('en-IN'):'No device event yet'}</small></div><div style={{display:'flex',gap:8,alignItems:'center'}}>{canManage&&<button style={secondary} disabled={loading} onClick={()=>void refreshDevice(device)}>Refresh health</button>}</div>{(commands[device.id]?.length??0)>0&&<details style={{gridColumn:'1 / -1'}}><summary>Recent command evidence</summary><div style={stack}>{commands[device.id].slice(0,5).map(command=><div key={command.id} style={auditRow}><span><b>{command.command}</b> · {command.status}<br/><small>{new Date(command.createdAt).toLocaleString('en-IN')}</small></span><code>{command.id.slice(0,8)}…</code></div>)}</div></details>}</article>)}</div>}</section>
    <section style={panel} aria-labelledby="future-compatibility"><h2 id="future-compatibility">Compatibility contract</h2><p style={muted}>Future adapters must preserve idempotency, event deduplication, isolation from direct database access and manual fallback.</p><div style={grid}>{compatibility.map(item=><article key={item.target} style={metric}><strong>{item.target.replaceAll('_',' ')}</strong><small>{item.requiredCapabilities.join(' · ')}</small><span>Manual fallback required</span></article>)}</div></section>
  </main>
}

const panel={background:'white',border:'1px solid #e5e7eb',borderRadius:18,padding:20,marginTop:18,boxShadow:'0 8px 24px rgba(15,23,42,.05)'} as const
const toolbar={display:'flex',justifyContent:'space-between',alignItems:'start',gap:16,flexWrap:'wrap'} as const
const grid={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12,marginTop:16} as const
const metric={background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:14,padding:16,display:'grid',gap:7} as const
const stack={display:'grid',gap:10,marginTop:14} as const
const card={display:'grid',gridTemplateColumns:'1fr auto',gap:14,alignItems:'center',border:'1px solid #e2e8f0',borderRadius:14,padding:16} as const
const auditRow={display:'flex',justifyContent:'space-between',gap:12,padding:'9px 0',borderBottom:'1px solid #e5e7eb'} as const
const muted={color:'#64748b'} as const
const empty={padding:24,textAlign:'center',color:'#64748b',background:'#f8fafc',borderRadius:14,marginTop:14} as const
const pill={display:'inline-flex',alignItems:'center',gap:7,padding:'8px 12px',borderRadius:999,background:'#ecfeff',color:'#155e75',fontWeight:800} as const
const readyPill={...pill,background:'#ecfdf5',color:'#166534'} as const
const neutralPill={...pill,background:'#f1f5f9',color:'#334155'} as const
const warningPill={...pill,background:'#fff7ed',color:'#9a3412'} as const
const readinessNote={marginTop:14,padding:14,border:'1px solid #dbe7ea',borderRadius:12,display:'grid',gap:5,background:'#f8fafc'} as const
const secondary={display:'inline-flex',alignItems:'center',gap:7,padding:'9px 12px',border:'1px solid #cbd5e1',borderRadius:10,background:'white',fontWeight:700,cursor:'pointer'} as const
const errorBox={marginTop:16,padding:14,borderRadius:12,background:'#fee2e2',color:'#991b1b'} as const
