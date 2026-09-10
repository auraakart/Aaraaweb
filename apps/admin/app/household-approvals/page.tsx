'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type Session={accessToken:string;role:string;societyName?:string}
type RequestRow={
  id:string;householdId:string;unitId:string;unitNumber:string;buildingName:string;
  type:'FAMILY_MEMBER_ADD'|'FAMILY_MEMBER_REMOVE'|'VEHICLE_ADD'|'VEHICLE_REMOVE';
  status:string;createdAt:string;targetId?:string;payload:Record<string,unknown>;
  requester?:{id:string;name?:string|null;phone:string}|null;
}
const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
function getSession():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw) as Session:null}catch{return null}}
async function api<T>(s:Session,path:string,init:RequestInit={}):Promise<T>{const r=await fetch(`${base}/api/v1${path}`,{...init,headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.accessToken}`,...init.headers}});const t=await r.text();const b=t?JSON.parse(t):null;if(!r.ok)throw new Error(b?.message??`Request failed (${r.status})`);return b as T}

export default function HouseholdApprovalsPage(){
  const[session,setSession]=useState<Session|null>(null),[rows,setRows]=useState<RequestRow[]>([]),[loading,setLoading]=useState(true),[busyId,setBusyId]=useState(''),[error,setError]=useState(''),[query,setQuery]=useState(''),[notes,setNotes]=useState<Record<string,string>>({})
  const allowed=(s:Session|null)=>!!s&&['SUPER_ADMIN','SOCIETY_ADMIN'].includes(s.role)
  const load=useCallback(async(s:Session)=>{setLoading(true);setError('');try{setRows(await api<RequestRow[]>(s,'/households/change-requests/pending'))}catch(e){setError(e instanceof Error?e.message:'Could not load household approvals')}finally{setLoading(false)}},[])
  useEffect(()=>{const s=getSession();setSession(s);if(s&&allowed(s))void load(s);else setLoading(false)},[load])
  const filtered=useMemo(()=>{const q=query.trim().toLowerCase();if(!q)return rows;return rows.filter(r=>[r.unitNumber,r.buildingName,r.requester?.name??'',r.requester?.phone??'',summary(r)].some(v=>v.toLowerCase().includes(q)))},[rows,query])
  const review=async(row:RequestRow,action:'approve'|'reject')=>{if(!session)return;setBusyId(row.id);setError('');try{await api(session,`/households/change-requests/${row.id}/${action}`,{method:'POST',body:JSON.stringify({note:(notes[row.id]??'').trim()||undefined})});setRows(current=>current.filter(item=>item.id!==row.id));setNotes(current=>{const next={...current};delete next[row.id];return next})}catch(e){setError(e instanceof Error?e.message:`Could not ${action} request`)}finally{setBusyId('')}}
  if(loading)return <main style={{padding:32}}>Loading household approvals…</main>
  if(!allowed(session))return <main style={{padding:32}}><h1>Society administration required</h1><a href="/">Return to Admin</a></main>
  return <main style={{maxWidth:1120,margin:'0 auto',padding:'28px 22px 80px'}}>
    <header style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap'}}><div><small>{session?.societyName??'Current society'}</small><h1 style={{margin:'4px 0'}}>Household approvals</h1><p style={{margin:0}}>Review family-member and vehicle changes before they become active.</p></div><a href="/">← Admin console</a></header>
    {error&&<div style={errorBox}>{error}</div>}
    <section style={panel}><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}><div><b>{rows.length} pending requests</b><div><small>Changes remain inactive until approved.</small></div></div><input aria-label="Search household approvals" placeholder="Search unit, resident or vehicle" value={query} onChange={e=>setQuery(e.target.value)} style={searchInput}/></div>
      <div style={{display:'grid',gap:12,marginTop:16}}>{filtered.length===0?<p>No pending household changes.</p>:filtered.map(row=><article key={row.id} style={card}><div style={{minWidth:260,flex:'1 1 420px'}}><div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><b style={{fontSize:17}}>{label(row.type)}</b><span style={pill}>Pending</span></div><div style={{marginTop:5}}>{summary(row)}</div><small>{row.buildingName} · Unit {row.unitNumber} · Requested by {row.requester?.name||row.requester?.phone||'resident'}</small><div style={{marginTop:6}}><small>{new Date(row.createdAt).toLocaleString('en-IN')}</small></div></div><div style={{display:'grid',gap:8,minWidth:300,flex:'0 1 380px'}}><label style={{display:'grid',gap:5}}><span style={{fontSize:13,fontWeight:700}}>Review note (optional)</span><input value={notes[row.id]??''} maxLength={200} onChange={e=>setNotes(current=>({...current,[row.id]:e.target.value}))} placeholder="Reason or verification note" style={editorInput}/></label><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button disabled={!!busyId} onClick={()=>void review(row,'approve')} style={primary}>{busyId===row.id?'Working…':'Approve'}</button><button disabled={!!busyId} onClick={()=>void review(row,'reject')} style={secondary}>Reject</button></div></div></article>)}</div>
    </section>
  </main>
}
function label(type:RequestRow['type']){switch(type){case'FAMILY_MEMBER_ADD':return'Add family member';case'FAMILY_MEMBER_REMOVE':return'Remove family member';case'VEHICLE_ADD':return'Add vehicle';case'VEHICLE_REMOVE':return'Remove vehicle'}}
function summary(row:RequestRow){const p=row.payload??{};switch(row.type){case'FAMILY_MEMBER_ADD':return`${String(p.name??'Family member')} · ${String(p.phone??'')}`;case'FAMILY_MEMBER_REMOVE':return String(p.name??'Family member');case'VEHICLE_ADD':return`${String(p.plateNumber??'Vehicle')} · ${String(p.vehicleType??'').replaceAll('_',' ')}`;case'VEHICLE_REMOVE':return String(p.plateNumber??'Vehicle')}}
const panel:React.CSSProperties={marginTop:20,padding:20,border:'1px solid #dbe7ea',borderRadius:16,background:'white'}
const card:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:18,alignItems:'center',padding:16,border:'1px solid #e5e7eb',borderRadius:12,flexWrap:'wrap'}
const primary:React.CSSProperties={padding:'10px 16px',borderRadius:10,border:'1px solid #05879A',background:'#05879A',color:'white',fontWeight:700}
const secondary:React.CSSProperties={padding:'10px 16px',borderRadius:10,border:'1px solid #dc2626',background:'white',color:'#b91c1c',fontWeight:700}
const editorInput:React.CSSProperties={padding:10,border:'1px solid #94a3b8',borderRadius:9,minWidth:260}
const searchInput:React.CSSProperties={padding:11,border:'1px solid #cbd5e1',borderRadius:10,minWidth:280}
const errorBox:React.CSSProperties={marginTop:18,padding:12,border:'1px solid #ef4444',borderRadius:10}
const pill:React.CSSProperties={padding:'3px 8px',borderRadius:999,background:'#fef3c7',fontSize:12,fontWeight:800}
