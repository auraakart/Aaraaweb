'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'

type Session={accessToken:string;role:string;societyName?:string}
type Slot={id:string;code:string;label?:string|null;slotType:string;active:boolean;evReady:boolean;locationNote?:string|null}
type EligibleVisitor={visitorId:string;visitorName:string;visitorPhone?:string|null;unitNumber:string;buildingName:string;visitorPassId:string;validFrom:string;validUntil:string}
type Permit={id:string;slotId:string;slotCode:string;slotType:string;visitorId:string;visitorName:string;visitorPhone?:string|null;unitNumber:string;buildingName:string;plateNumber:string;startsAt:string;endsAt:string;status:string;note?:string|null}

const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
const viewRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER','COMMITTEE_MEMBER','SECURITY_SUPERVISOR'])
const manageRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER'])
function getSession():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw) as Session:null}catch{return null}}
function errorMessage(body:unknown,status:number){if(body&&typeof body==='object'&&'message' in body){const value=(body as {message?:unknown}).message;if(Array.isArray(value))return value.map(String).join(', ');if(typeof value==='string')return value}return `Request failed (${status})`}
async function api<T>(session:Session,path:string,init:RequestInit={}):Promise<T>{const response=await fetch(`${base}/api/v1${path}`,{...init,headers:{Accept:'application/json','Content-Type':'application/json',Authorization:`Bearer ${session.accessToken}`,...init.headers}});const text=await response.text();let body:unknown=null;try{body=text?JSON.parse(text):null}catch{body=text}if(!response.ok)throw new Error(errorMessage(body,response.status));return body as T}
const fmt=(value:string)=>new Date(value).toLocaleString('en-IN')
const localIso=(value:string)=>new Date(value).toISOString()

export default function VisitorParkingPermitsPage(){
  const session=typeof window==='undefined'?null:getSession()
  const canView=!!session&&viewRoles.has(session.role)
  const canManage=!!session&&manageRoles.has(session.role)
  const[slots,setSlots]=useState<Slot[]>([])
  const[visitors,setVisitors]=useState<EligibleVisitor[]>([])
  const[permits,setPermits]=useState<Permit[]>([])
  const[visitorPassId,setVisitorPassId]=useState('')
  const[slotId,setSlotId]=useState('')
  const[plateNumber,setPlateNumber]=useState('')
  const[startsAt,setStartsAt]=useState('')
  const[endsAt,setEndsAt]=useState('')
  const[note,setNote]=useState('')
  const[busy,setBusy]=useState(false)
  const[error,setError]=useState('')
  const eligibleSlots=useMemo(()=>slots.filter(s=>s.active&&['VISITOR','TEMPORARY','ACCESSIBLE'].includes(s.slotType)),[slots])
  const selectedVisitor=useMemo(()=>visitors.find(v=>v.visitorPassId===visitorPassId)??null,[visitors,visitorPassId])

  async function load(){if(!session||!canView)return;setBusy(true);setError('');try{const[s,v,p]=await Promise.all([api<Slot[]>(session,'/parking/v2/slots'),api<EligibleVisitor[]>(session,'/parking/v2/eligible-visitors'),api<Permit[]>(session,'/parking/v2/permits')]);setSlots(s);setVisitors(v);setPermits(p)}catch(e){setError(e instanceof Error?e.message:'Could not load parking permits')}finally{setBusy(false)}}
  useEffect(()=>{void load()},[])

  async function submit(e:FormEvent){e.preventDefault();if(!session||!canManage||!selectedVisitor)return;setBusy(true);setError('');try{await api(session,'/parking/v2/permits',{method:'POST',body:JSON.stringify({slotId,visitorId:selectedVisitor.visitorId,visitorPassId:selectedVisitor.visitorPassId,plateNumber,startsAt:localIso(startsAt),endsAt:localIso(endsAt),note:note||undefined})});setPlateNumber('');setNote('');await load()}catch(err){setError(err instanceof Error?err.message:'Could not create parking permit')}finally{setBusy(false)}}
  async function closePermit(id:string,action:'cancel'|'complete'){if(!session||!canManage)return;setBusy(true);setError('');try{await api(session,`/parking/v2/permits/${id}/${action}`,{method:'PATCH',body:JSON.stringify({})});await load()}catch(err){setError(err instanceof Error?err.message:`Could not ${action} parking permit`)}finally{setBusy(false)}}

  if(!session||!canView)return <main style={{padding:32}}><h1>Parking access required</h1><p>Advanced parking visibility is required for this view.</p><a href="/">Return to Admin</a></main>
  return <main style={{maxWidth:1220,margin:'0 auto',padding:'28px 22px 80px'}}>
    <header><small>{session.societyName??'Current society'} · {session.role.replaceAll('_',' ')}</small><h1>Visitor & temporary parking</h1><p>Issue time-bound parking authorization only for an approved visitor pass and an eligible visitor, temporary or accessible slot.</p></header>
    <p style={warning}>A parking permit is an operational parking authorization. It is not evidence that the vehicle actually entered, parked, or exited the society.</p>
    {error&&<p style={err}>{error}</p>}
    {canManage&&<form onSubmit={submit} style={panel}><h2>Issue permit</h2><div style={grid}>
      <label>Approved visitor<select required value={visitorPassId} onChange={e=>{const id=e.target.value;setVisitorPassId(id);const v=visitors.find(x=>x.visitorPassId===id);if(v){const from=new Date(v.validFrom);const until=new Date(v.validUntil);setStartsAt(toLocal(from));setEndsAt(toLocal(until))}}} style={input}><option value="">Select visitor</option>{visitors.map(v=><option key={v.visitorPassId} value={v.visitorPassId}>{v.visitorName} · {v.buildingName} {v.unitNumber} · until {fmt(v.validUntil)}</option>)}</select></label>
      <label>Parking slot<select required value={slotId} onChange={e=>setSlotId(e.target.value)} style={input}><option value="">Select slot</option>{eligibleSlots.map(s=><option key={s.id} value={s.id}>{s.code} · {s.slotType}{s.evReady?' · EV ready':''}</option>)}</select></label>
      <label>Vehicle registration<input required maxLength={30} value={plateNumber} onChange={e=>setPlateNumber(e.target.value)} placeholder="TN 01 AB 1234" style={input}/></label>
      <label>Starts<input required type="datetime-local" value={startsAt} onChange={e=>setStartsAt(e.target.value)} style={input}/></label>
      <label>Ends<input required type="datetime-local" value={endsAt} onChange={e=>setEndsAt(e.target.value)} style={input}/></label>
      <label>Note<input maxLength={300} value={note} onChange={e=>setNote(e.target.value)} style={input}/></label>
    </div>{selectedVisitor&&<p style={hint}>Visitor pass validity: {fmt(selectedVisitor.validFrom)} → {fmt(selectedVisitor.validUntil)}</p>}<button disabled={busy||!visitorPassId||!slotId||!plateNumber||!startsAt||!endsAt} style={button}>{busy?'Saving…':'Issue parking permit'}</button></form>}
    <section style={{...panel,marginTop:18}}><div style={row}><div><h2 style={{marginBottom:4}}>Permits</h2><small>{permits.length} records</small></div><button disabled={busy} onClick={()=>void load()} style={secondary}>Refresh</button></div><div style={{overflowX:'auto',marginTop:14}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr><Th>Status</Th><Th>Visitor</Th><Th>Unit</Th><Th>Slot</Th><Th>Vehicle</Th><Th>Window</Th>{canManage&&<Th>Actions</Th>}</tr></thead><tbody>{permits.map(p=><tr key={p.id}><Td><b>{p.status}</b></Td><Td>{p.visitorName}<br/><small>{p.visitorPhone??'No phone'}</small></Td><Td>{p.buildingName} {p.unitNumber}</Td><Td>{p.slotCode}<br/><small>{p.slotType}</small></Td><Td>{p.plateNumber}</Td><Td>{fmt(p.startsAt)}<br/>to {fmt(p.endsAt)}</Td>{canManage&&<Td>{p.status==='ACTIVE'?<div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button onClick={()=>void closePermit(p.id,'complete')} style={secondary}>Complete</button><button onClick={()=>void closePermit(p.id,'cancel')} style={danger}>Cancel</button></div>:'—'}</Td>}</tr>)}{permits.length===0&&<tr><Td colSpan={canManage?7:6}>No parking permits yet.</Td></tr>}</tbody></table></div></section>
    <p style={{marginTop:22}}><a href="/parking">← Back to parking</a></p>
  </main>
}

function toLocal(d:Date){const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,16)}
function Th({children}:{children:React.ReactNode}){return <th style={{textAlign:'left',padding:'10px 9px',borderBottom:'1px solid #cbd5e1',fontSize:13}}>{children}</th>}
function Td({children,colSpan}:{children:React.ReactNode,colSpan?:number}){return <td colSpan={colSpan} style={{padding:'12px 9px',borderBottom:'1px solid #eef2f7',verticalAlign:'top'}}>{children}</td>}
const panel={background:'#fff',border:'1px solid #e5e7eb',borderRadius:18,padding:20,boxShadow:'0 8px 24px rgba(15,23,42,.05)'}
const grid={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:14}
const row={display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap' as const}
const input={display:'block',width:'100%',marginTop:6,padding:'10px 12px',border:'1px solid #cbd5e1',borderRadius:10,boxSizing:'border-box' as const}
const button={border:0,borderRadius:10,padding:'11px 15px',background:'#05879A',color:'#fff',fontWeight:700,cursor:'pointer',marginTop:14}
const secondary={border:'1px solid #cbd5e1',borderRadius:9,padding:'8px 11px',background:'#fff',cursor:'pointer'}
const danger={border:'1px solid #fecaca',borderRadius:9,padding:'8px 11px',background:'#fff1f2',color:'#9f1239',cursor:'pointer'}
const warning={fontSize:13,lineHeight:1.5,color:'#92400e',background:'#fffbeb',border:'1px solid #fde68a',borderRadius:10,padding:12}
const hint={fontSize:13,color:'#475569'}
const err={background:'#fff1f2',border:'1px solid #fecdd3',padding:12,borderRadius:10,color:'#9f1239'}
