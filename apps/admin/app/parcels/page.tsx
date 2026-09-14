'use client'

import { FormEvent,useEffect,useMemo,useState } from 'react'

type Session={accessToken:string;role:string;societyName?:string}
type Parcel={id:string;unitId:string;recipientUserId:string;unitNumber:string;recipientName:string;courierName?:string|null;trackingReference?:string|null;receivedAt:string;overdue:boolean}
type Recipient={userId:string;name:string;unitId:string;unitNumber:string;buildingName?:string|null;buildingCode?:string|null}
const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
const roles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER'])
function getSession():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw):null}catch{return null}}
function messageFrom(body:unknown):string|undefined{if(!body||typeof body!=='object'||!('message' in body))return;const value=(body as {message?:unknown}).message;if(Array.isArray(value))return value.map(String).join(', ');return typeof value==='string'?value:undefined}
async function api<T>(s:Session,path:string,init:RequestInit={}):Promise<T>{const r=await fetch(`${base}/api/v1${path}`,{...init,headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.accessToken}`,...init.headers}});const text=await r.text();let body:unknown=null;try{body=text?JSON.parse(text):null}catch{body=text}if(!r.ok)throw new Error(messageFrom(body)??`Request failed (${r.status})`);return body as T}
const fmt=(v:string)=>new Date(v).toLocaleString('en-IN')

export default function ParcelsPage(){
 const s=typeof window==='undefined'?null:getSession(),allowed=!!s&&roles.has(s.role)
 const[parcels,setParcels]=useState<Parcel[]>([]),[recipients,setRecipients]=useState<Recipient[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState('')
 const[recipientKey,setRecipientKey]=useState(''),[courier,setCourier]=useState(''),[tracking,setTracking]=useState(''),[notes,setNotes]=useState('')
 const summary=useMemo(()=>({waiting:parcels.length,overdue:parcels.filter(p=>p.overdue).length,units:new Set(parcels.map(p=>p.unitId)).size}),[parcels])
 async function load(){if(!s||!allowed)return;setBusy(true);setError('');try{const[p,r]=await Promise.all([api<Parcel[]>(s,'/parcels/desk'),api<Recipient[]>(s,'/parcels/desk/recipients')]);setParcels(p);setRecipients(r);if(!recipientKey&&r.length)setRecipientKey(`${r[0].unitId}:${r[0].userId}`)}catch(e){setError(e instanceof Error?e.message:'Could not load parcel desk')}finally{setBusy(false)}}
 useEffect(()=>{void load()},[])
 async function receive(event:FormEvent){event.preventDefault();if(!s)return;const target=recipients.find(r=>`${r.unitId}:${r.userId}`===recipientKey);if(!target){setError('Select a current occupant');return}setBusy(true);setError('');setResult('');try{await api(s,'/parcels/desk',{method:'POST',body:JSON.stringify({unitId:target.unitId,recipientUserId:target.userId,courierName:courier.trim()||undefined,trackingReference:tracking.trim()||undefined,notes:notes.trim()||undefined})});setCourier('');setTracking('');setNotes('');setResult('Parcel received and resident notified.');await load()}catch(e){setError(e instanceof Error?e.message:'Could not receive parcel')}finally{setBusy(false)}}
 async function remind(id:string){if(!s)return;setBusy(true);setError('');setResult('');try{await api(s,`/parcels/desk/${id}/remind`,{method:'POST'});setResult('Pickup reminder sent.');await load()}catch(e){setError(e instanceof Error?e.message:'Could not send reminder')}finally{setBusy(false)}}
 async function verify(id:string){if(!s)return;const code=window.prompt('Enter the resident 6-digit pickup code')?.trim();if(!code)return;setBusy(true);setError('');setResult('');try{await api(s,`/parcels/desk/${id}/collect-with-code`,{method:'PATCH',body:JSON.stringify({code})});setResult('Pickup verified and parcel collected.');await load()}catch(e){setError(e instanceof Error?e.message:'Could not verify pickup code')}finally{setBusy(false)}}
 async function returnParcel(id:string){if(!s)return;const reason=window.prompt('Reason for returning this parcel')?.trim();if(!reason)return;setBusy(true);setError('');setResult('');try{await api(s,`/parcels/desk/${id}/return`,{method:'PATCH',body:JSON.stringify({reason})});setResult('Parcel marked returned to sender.');await load()}catch(e){setError(e instanceof Error?e.message:'Could not return parcel')}finally{setBusy(false)}}
 if(!s||!allowed)return <main style={{padding:32}}><h1>Parcel operations access required</h1><p>This page is available to society operations roles.</p><a href="/">Return to Admin</a></main>
 return <main style={{maxWidth:1180,margin:'0 auto',padding:'28px 22px 80px'}}>
  <header><small>{s.societyName??'Current society'} · {s.role.replaceAll('_',' ')}</small><h1>Parcel operations</h1><p>Receive deliveries, monitor uncollected parcels, verify resident pickup codes and manage overdue handovers.</p><p><a href="/">← Admin home</a></p></header>
  {error&&<p style={errorBox}>{error}</p>}{result&&<p style={successBox}>{result}</p>}
  <section style={panel}><div style={stats}><div><b>{summary.waiting}</b><span>Waiting</span></div><div><b>{summary.overdue}</b><span>Overdue 24h+</span></div><div><b>{summary.units}</b><span>Units affected</span></div></div></section>
  <section style={{...panel,marginTop:18}}><h2>Receive parcel</h2><p style={muted}>Recipient choices come only from current active occupants. Contact details are not exposed.</p><form onSubmit={receive} style={formGrid}>
   <label style={field}>Resident & unit<select value={recipientKey} onChange={e=>setRecipientKey(e.target.value)} required style={input}>{recipients.map(r=><option key={`${r.unitId}:${r.userId}`} value={`${r.unitId}:${r.userId}`}>{r.buildingName??r.buildingCode??'Building'} · {r.unitNumber} · {r.name}</option>)}</select></label>
   <label style={field}>Courier / provider<input value={courier} onChange={e=>setCourier(e.target.value)} maxLength={120} style={input}/></label>
   <label style={field}>Tracking reference<input value={tracking} onChange={e=>setTracking(e.target.value)} maxLength={160} style={input}/></label>
   <label style={{...field,gridColumn:'1/-1'}}>Notes<textarea value={notes} onChange={e=>setNotes(e.target.value)} maxLength={500} rows={3} style={input}/></label>
   <div style={{gridColumn:'1/-1'}}><button disabled={busy||!recipients.length} style={button}>Receive & notify resident</button></div>
  </form></section>
  <section style={{...panel,marginTop:18}}><div style={row}><div><h2 style={{marginBottom:4}}>Uncollected desk</h2><p style={{...muted,margin:0}}>Oldest and overdue parcels need attention first.</p></div><button disabled={busy} onClick={()=>void load()} style={secondary}>Refresh</button></div>
   {parcels.length===0?<p>No parcels are waiting for collection.</p>:parcels.map(p=><article key={p.id} style={item}><div><div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><strong>{p.unitNumber} · {p.recipientName}</strong>{p.overdue&&<span style={overdueBadge}>OVERDUE</span>}</div><p style={{margin:'7px 0'}}>{p.courierName??'Courier not specified'}{p.trackingReference?` · ${p.trackingReference}`:''}</p><small>Received {fmt(p.receivedAt)}</small></div><div style={actions}><button disabled={busy} onClick={()=>void verify(p.id)} style={button}>Verify pickup</button><button disabled={busy||!p.overdue} onClick={()=>void remind(p.id)} style={secondary}>Remind</button><button disabled={busy} onClick={()=>void returnParcel(p.id)} style={secondary}>Return</button></div></article>)}
  </section>
 </main>
}
const panel={background:'#fff',border:'1px solid #e5e7eb',borderRadius:18,padding:20,boxShadow:'0 8px 24px rgba(15,23,42,.05)'}
const stats={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:12}
const row={display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap' as const}
const formGrid={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:14}
const field={display:'grid',gap:6,fontWeight:700}
const input={width:'100%',boxSizing:'border-box' as const,border:'1px solid #cbd5e1',borderRadius:10,padding:'10px 12px',font:'inherit',background:'#fff'}
const item={display:'flex',justifyContent:'space-between',gap:16,padding:'16px 0',borderBottom:'1px solid #eef2f7',alignItems:'flex-start',flexWrap:'wrap' as const}
const actions={display:'flex',gap:8,flexWrap:'wrap' as const,justifyContent:'flex-end'}
const button={border:0,borderRadius:10,padding:'10px 14px',background:'#05879A',color:'#fff',fontWeight:700,cursor:'pointer'}
const secondary={border:'1px solid #cbd5e1',borderRadius:10,padding:'9px 12px',background:'#fff',fontWeight:700,cursor:'pointer'}
const overdueBadge={display:'inline-block',padding:'4px 8px',borderRadius:999,fontSize:12,fontWeight:800,background:'#fef3c7',color:'#92400e'}
const muted={color:'#64748b'}
const errorBox={background:'#fff1f2',border:'1px solid #fecdd3',padding:12,borderRadius:10,color:'#9f1239'}
const successBox={background:'#ecfdf5',border:'1px solid #a7f3d0',padding:12,borderRadius:10,color:'#065f46'}
