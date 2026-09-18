'use client'

import { useCallback, useEffect, useState } from 'react'

type Session={accessToken:string;role:string;societyName?:string}
type Policy={maxActiveResidentVehicles:number;requireCredential:boolean;allowTemporaryOverflow:boolean}
type Credential={id:string;credential:string;status:string;plateNumber:string;unitNumber:string;buildingName:string;issuedAt:string}
type Violation={id:string;code:string;severity:string;status:string;slotCode?:string|null;plateNumber?:string|null;note?:string|null;reportedAt:string}
const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
function session():Session|null{try{const r=sessionStorage.getItem('aaraagate.admin.session');return r?JSON.parse(r):null}catch{return null}}
async function api<T>(s:Session,path:string,init:RequestInit={}):Promise<T>{const r=await fetch(`${base}/api/v1${path}`,{...init,headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.accessToken}`,...init.headers}});const t=await r.text();const b=t?JSON.parse(t):null;if(!r.ok)throw new Error(b?.message??`Request failed (${r.status})`);return b as T}

export default function AdvancedParkingPage(){
 const[s,setS]=useState<Session|null>(null),[policy,setPolicy]=useState<Policy>({maxActiveResidentVehicles:2,requireCredential:false,allowTemporaryOverflow:true}),[credentials,setCredentials]=useState<Credential[]>([]),[violations,setViolations]=useState<Violation[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const canManage=!!s&&['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER'].includes(s.role)
 const load=useCallback(async(x:Session)=>{setError('');try{const[p,c,v]=await Promise.all([api<Policy[]>(x,'/parking/v2/policy'),api<Credential[]>(x,'/parking/v2/credentials'),api<Violation[]>(x,'/parking/v2/violations')]);if(p[0])setPolicy(p[0]);setCredentials(c);setViolations(v)}catch(e){setError(e instanceof Error?e.message:'Could not load advanced parking')}},[])
 useEffect(()=>{const x=session();setS(x);if(x)void load(x)},[load])
 const save=async()=>{if(!s||!canManage)return;setBusy(true);setError('');try{await api(s,'/parking/v2/policy',{method:'PUT',body:JSON.stringify(policy)});await load(s)}catch(e){setError(e instanceof Error?e.message:'Could not save policy')}finally{setBusy(false)}}
 const revoke=async(id:string)=>{if(!s||!canManage)return;setBusy(true);try{await api(s,`/parking/v2/credentials/${id}/revoke`,{method:'PATCH',body:'{}'});await load(s)}catch(e){setError(e instanceof Error?e.message:'Could not revoke credential')}finally{setBusy(false)}}
 const resolve=async(id:string)=>{if(!s||!canManage)return;setBusy(true);try{await api(s,`/parking/v2/violations/${id}/resolve`,{method:'PATCH',body:'{}'});await load(s)}catch(e){setError(e instanceof Error?e.message:'Could not resolve violation')}finally{setBusy(false)}}
 if(!s)return <main style={{padding:32}}><h1>Sign in required</h1></main>
 return <main style={{maxWidth:1120,margin:'0 auto',padding:'28px 22px 80px'}}>
  <header style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><div><small>{s.societyName??'Current society'}</small><h1>Advanced parking</h1><p>Repository-managed policy, credentials, temporary/visitor controls and violation evidence. Hardware integrations are intentionally excluded.</p></div><div><a href="/parking">Parking</a> · <a href="/parking/permits">Visitor permits</a></div></header>
  {error&&<div style={{padding:12,border:'1px solid #ef4444',borderRadius:10,margin:'16px 0'}}>{error}</div>}
  <section style={panel}><h2>Society policy</h2><div style={{display:'grid',gap:12,maxWidth:520}}>
   <label>Maximum active resident parking allocations<input type="number" min={1} max={12} value={policy.maxActiveResidentVehicles} disabled={!canManage} onChange={e=>setPolicy({...policy,maxActiveResidentVehicles:Number(e.target.value)})} style={input}/></label>
   <label><input type="checkbox" checked={policy.requireCredential} disabled={!canManage} onChange={e=>setPolicy({...policy,requireCredential:e.target.checked})}/> Require parking credential</label>
   <label><input type="checkbox" checked={policy.allowTemporaryOverflow} disabled={!canManage} onChange={e=>setPolicy({...policy,allowTemporaryOverflow:e.target.checked})}/> Allow temporary overflow parking</label>
   {canManage&&<button disabled={busy} onClick={()=>void save()} style={button}>Save policy</button>}
  </div></section>
  <section style={panel}><h2>Vehicle credentials</h2>{credentials.length===0?<p>No parking credentials issued.</p>:credentials.map(x=><article key={x.id} style={row}><div><b>{x.credential}</b><div>{x.plateNumber} · {x.buildingName} {x.unitNumber}</div><small>{x.status}</small></div>{canManage&&x.status==='ACTIVE'&&<button disabled={busy} onClick={()=>void revoke(x.id)} style={button}>Revoke</button>}</article>)}</section>
  <section style={panel}><h2>Parking violations</h2>{violations.length===0?<p>No parking violations recorded.</p>:violations.map(x=><article key={x.id} style={row}><div><b>{x.code}</b><div>{x.severity} · {x.slotCode??'No slot'} · {x.plateNumber??'No resident vehicle'}</div><small>{x.status}{x.note?` · ${x.note}`:''}</small></div>{canManage&&x.status==='OPEN'&&<button disabled={busy} onClick={()=>void resolve(x.id)} style={button}>Resolve</button>}</article>)}</section>
 </main>
}
const panel:React.CSSProperties={marginTop:18,padding:20,border:'1px solid #dbe7ea',borderRadius:16,background:'white'}
const row:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',padding:'12px 0',borderBottom:'1px solid #e5e7eb',flexWrap:'wrap'}
const input:React.CSSProperties={display:'block',marginTop:6,padding:10,border:'1px solid #94a3b8',borderRadius:9,width:'100%'}
const button:React.CSSProperties={padding:'10px 14px',borderRadius:10,border:'1px solid #05879A',background:'#05879A',color:'white',fontWeight:700}
