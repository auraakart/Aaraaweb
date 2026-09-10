'use client'

import { useCallback, useEffect, useState } from 'react'

type Session={accessToken:string;role:string;societyName?:string}
type RequestRow={id:string;type:string;status:string;householdId:string;unitId:string;unitNumber:string;buildingName:string;payload:Record<string,unknown>;targetId?:string;createdAt:string;requester?:{name?:string|null;phone:string}|null}
const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
function getSession():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw) as Session:null}catch{return null}}
async function api<T>(s:Session,path:string,init:RequestInit={}):Promise<T>{const r=await fetch(`${base}/api/v1${path}`,{...init,headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.accessToken}`,...init.headers}});const t=await r.text();const b=t?JSON.parse(t):null;if(!r.ok)throw new Error(b?.message??`Request failed (${r.status})`);return b as T}

export default function HouseholdApprovalsPage(){
  const[session,setSession]=useState<Session|null>(null),[rows,setRows]=useState<RequestRow[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState('')
  const allowed=(s:Session|null)=>!!s&&s.role==='SOCIETY_ADMIN'
  const load=useCallback(async(s:Session)=>{setLoading(true);setError('');try{setRows(await api<RequestRow[]>(s,'/household-change-requests/admin/pending'))}catch(e){setError(e instanceof Error?e.message:'Could not load household approval requests')}finally{setLoading(false)}},[])
  useEffect(()=>{const s=getSession();setSession(s);if(s&&allowed(s))void load(s);else setLoading(false)},[load])
  const review=async(row:RequestRow,action:'approve'|'reject')=>{if(!session)return;setBusy(row.id);setError('');try{await api(session,`/household-change-requests/admin/${row.id}/${action}`,{method:'POST',body:'{}'});await load(session)}catch(e){setError(e instanceof Error?e.message:'Could not review request')}finally{setBusy('')}}
  if(loading)return <main style={{padding:32}}>Loading household approvals…</main>
  if(!allowed(session))return <main style={{padding:32}}><h1>Society Admin approval required</h1><a href="/">Return to Admin</a></main>
  return <main style={{maxWidth:1080,margin:'0 auto',padding:'28px 22px 80px'}}><header><small>{session?.societyName??'Current society'}</small><h1 style={{margin:'4px 0'}}>Household approvals</h1><p style={{margin:0}}>Review family-member and vehicle changes before they become active society records.</p><p><a href="/">← Admin console</a></p></header>{error&&<div style={errorBox}>{error}</div>}<section style={panel}>{rows.length===0?<p>No pending household changes.</p>:<div style={{display:'grid',gap:12}}>{rows.map(row=><article key={row.id} style={card}><div style={{flex:1,minWidth:260}}><b>{label(row.type)}</b><div>{row.buildingName} · Unit {row.unitNumber}</div><small>Requested by {row.requester?.name||row.requester?.phone||'Resident'} · {new Date(row.createdAt).toLocaleString()}</small><div style={{marginTop:8}}>{details(row)}</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button disabled={!!busy} onClick={()=>void review(row,'approve')} style={primary}>{busy===row.id?'Working…':'Approve'}</button><button disabled={!!busy} onClick={()=>void review(row,'reject')} style={secondary}>Reject</button></div></article>)}</div>}</section></main>
}
function label(type:string){return type==='FAMILY_MEMBER_ADD'?'Add family member':type==='FAMILY_MEMBER_REMOVE'?'Remove family member':type==='VEHICLE_ADD'?'Add vehicle':type==='VEHICLE_REMOVE'?'Remove vehicle':type.replaceAll('_',' ')}
function details(row:RequestRow){const p=row.payload??{};if(row.type==='FAMILY_MEMBER_ADD')return <span>{String(p.name??'')} · {String(p.phone??'')}</span>;if(row.type.startsWith('VEHICLE'))return <span>{String(p.plateNumber??'Vehicle')}{p.vehicleType?` · ${String(p.vehicleType).replaceAll('_',' ')}`:''}</span>;return <span>Review requested household change.</span>}
const panel:React.CSSProperties={marginTop:20,padding:20,border:'1px solid #dbe7ea',borderRadius:16,background:'white'}
const card:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',padding:14,border:'1px solid #e5e7eb',borderRadius:12,flexWrap:'wrap'}
const primary:React.CSSProperties={padding:'10px 14px',borderRadius:10,border:'1px solid #05879A',background:'#05879A',color:'white',fontWeight:700}
const secondary:React.CSSProperties={padding:'10px 14px',borderRadius:10,border:'1px solid #94a3b8',background:'white',color:'#334155',fontWeight:700}
const errorBox:React.CSSProperties={marginTop:18,padding:12,border:'1px solid #ef4444',borderRadius:10}
