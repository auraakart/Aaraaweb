'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'

type Session={accessToken:string;role:string;societyName?:string}
type Membership={id:string;role:string;createdAt:string;user:{id:string;name?:string|null;phone:string;email?:string|null;status:string}}
const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
const assignableRoles=['COMMITTEE_MEMBER','FACILITY_MANAGER','ACCOUNTANT','SECURITY_SUPERVISOR','SECURITY_GUARD','STAFF']
function getSession():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw) as Session:null}catch{return null}}
async function api<T>(s:Session,path:string,init:RequestInit={}):Promise<T>{const r=await fetch(`${base}/api/v1${path}`,{...init,headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.accessToken}`,...init.headers}});const t=await r.text();const b=t?JSON.parse(t):null;if(!r.ok)throw new Error(b?.message??`Request failed (${r.status})`);return b as T}

export default function RolesPage(){
  const[session,setSession]=useState<Session|null>(null),[rows,setRows]=useState<Membership[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const[name,setName]=useState(''),[phone,setPhone]=useState('+91'),[role,setRole]=useState('SECURITY_GUARD')
  const allowed=(s:Session|null)=>!!s&&['SUPER_ADMIN','SOCIETY_ADMIN'].includes(s.role)
  const load=useCallback(async(s:Session)=>{setLoading(true);setError('');try{setRows(await api<Membership[]>(s,'/society-roles'))}catch(e){setError(e instanceof Error?e.message:'Could not load society roles')}finally{setLoading(false)}},[])
  useEffect(()=>{const s=getSession();setSession(s);if(s&&allowed(s))void load(s);else setLoading(false)},[load])
  const provision=(e:FormEvent)=>{e.preventDefault();if(!session)return;setBusy(true);setError('');void api(session,'/society-roles',{method:'POST',body:JSON.stringify({name:name.trim(),phone:phone.trim(),role})}).then(()=>{setName('');setPhone('+91');return load(session)}).catch(e=>setError(e instanceof Error?e.message:'Could not assign role')).finally(()=>setBusy(false))}
  const deactivate=(m:Membership)=>{if(!session||!confirm(`Deactivate ${m.role.replaceAll('_',' ')} for ${m.user.name||m.user.phone}? Active sessions for this society will be revoked.`))return;setBusy(true);setError('');void api(session,`/society-roles/${m.id}/deactivate`,{method:'PATCH',body:'{}'}).then(()=>load(session)).catch(e=>setError(e instanceof Error?e.message:'Could not deactivate role')).finally(()=>setBusy(false))}
  if(loading)return <main style={{padding:32}}>Loading people and roles…</main>
  if(!allowed(session))return <main style={{padding:32}}><h1>Society administration required</h1><a href="/">Return to Admin</a></main>
  return <main style={{maxWidth:1080,margin:'0 auto',padding:'28px 22px 80px'}}><header style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap'}}><div><small>{session?.societyName??'Current society'}</small><h1 style={{margin:'4px 0'}}>People & roles</h1><p style={{margin:0}}>Assign only society-operational roles. Owner, tenant and family roles remain unit-relationship driven; Society Admin remains platform-managed.</p></div><a href="/">← Admin console</a></header>{error&&<div style={errorBox}>{error}</div>}<section style={panel}><h2>Assign operational role</h2><form onSubmit={provision} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:10,alignItems:'end'}}><label style={label}>Name<input style={input} value={name} onChange={e=>setName(e.target.value)} required/></label><label style={label}>Mobile<input style={input} value={phone} onChange={e=>setPhone(e.target.value)} required/></label><label style={label}>Role<select style={input} value={role} onChange={e=>setRole(e.target.value)}>{assignableRoles.map(r=><option key={r} value={r}>{r.replaceAll('_',' ')}</option>)}</select></label><button disabled={busy} style={primary}>{busy?'Saving…':'Assign role'}</button></form></section><section style={panel}><h2>Active operational roles</h2>{rows.length===0?<p>No operational roles assigned.</p>:<div style={{display:'grid',gap:10}}>{rows.map(m=><article key={m.id} style={row}><div><b>{m.user.name||'Unnamed user'}</b><div>{m.user.phone}{m.user.email?` · ${m.user.email}`:''}</div><small>{m.role.replaceAll('_',' ')} · {m.user.status}</small></div><button disabled={busy} onClick={()=>deactivate(m)} style={button}>Deactivate</button></article>)}</div>}</section></main>
}
const panel:React.CSSProperties={marginTop:20,padding:20,border:'1px solid #dbe7ea',borderRadius:16,background:'white'}
const label:React.CSSProperties={display:'grid',gap:6}
const input:React.CSSProperties={padding:11,border:'1px solid #cbd5e1',borderRadius:10}
const button:React.CSSProperties={padding:'10px 14px',borderRadius:10,border:'1px solid #cbd5e1',background:'white',fontWeight:700}
const primary:React.CSSProperties={...button,background:'#05879A',color:'white',borderColor:'#05879A'}
const row:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',padding:12,border:'1px solid #e5e7eb',borderRadius:12}
const errorBox:React.CSSProperties={marginTop:18,padding:12,border:'1px solid #ef4444',borderRadius:10}
