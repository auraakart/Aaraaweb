'use client'

import {useEffect,useState} from 'react'

type Session={accessToken:string;role:string;societyName?:string}
type Option={id:string;ordinal:number;label:string}
type Poll={id:string;pollType:'ADVISORY'|'SURVEY';status:'DRAFT'|'OPEN'|'CLOSED'|'CANCELLED';title:string;description?:string|null;opensAt?:string|null;closesAt?:string|null;statutoryUseProhibited:boolean;options:Option[]}
const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
const roles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER'])
function session():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw):null}catch{return null}}
async function api<T>(s:Session,path:string,init:RequestInit={}):Promise<T>{const r=await fetch(`${base}/api/v1${path}`,{...init,headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.accessToken}`,...init.headers}});const text=await r.text(),body=text?JSON.parse(text):null;if(!r.ok)throw new Error(Array.isArray(body?.message)?body.message.join(', '):body?.message??`Request failed (${r.status})`);return body as T}

export default function GovernancePollsPage(){
 const s=typeof window==='undefined'?null:session();const allowed=!!s&&roles.has(s.role)
 const[polls,setPolls]=useState<Poll[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 async function load(){if(!s||!allowed)return;setBusy(true);setError('');try{setPolls(await api<Poll[]>(s,'/governance/polls'))}catch(e){setError(e instanceof Error?e.message:'Could not load polls')}finally{setBusy(false)}}
 useEffect(()=>{void load()},[])
 async function transition(id:string,status:'OPEN'|'CLOSED'|'CANCELLED'){if(!s)return;setBusy(true);setError('');try{await api(s,`/governance/community-polls/${id}/status`,{method:'POST',body:JSON.stringify({status})});await load()}catch(e){setError(e instanceof Error?e.message:'Could not update poll')}finally{setBusy(false)}}
 if(!s||!allowed)return <main style={{padding:32}}><h1>Governance access required</h1><a href="/">Return to Admin</a></main>
 return <main style={{maxWidth:1100,margin:'0 auto',padding:'28px 22px 80px'}}><header><small>{s.societyName??'Current society'} · {s.role.replaceAll('_',' ')}</small><h1>Community polls</h1><p>Manage advisory and survey polls. These controls are intentionally separated from statutory society voting and legal resolutions.</p><a href="/governance">← Governance workspace</a></header>{error&&<p style={{padding:12,background:'#fee2e2',borderRadius:10}}>{error}</p>}<section style={panel}><div style={row}><h2 style={{margin:0}}>Poll lifecycle</h2><button onClick={()=>void load()} disabled={busy} style={secondary}>Refresh</button></div>{polls.length===0?<p>No polls have been created.</p>:polls.map(p=><article key={p.id} style={item}><div><div style={row}><strong>{p.title}</strong><span>{p.status}</span></div><p style={{margin:'6px 0'}}>{p.description||`${p.pollType.toLowerCase()} poll`}</p><small>Non-statutory use enforced: {p.statutoryUseProhibited?'Yes':'No'}</small><ol>{p.options.map(o=><li key={o.id}>{o.label}</li>)}</ol></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{p.status==='DRAFT'&&<button disabled={busy} style={button} onClick={()=>void transition(p.id,'OPEN')}>Open poll</button>}{p.status==='OPEN'&&<button disabled={busy} style={button} onClick={()=>void transition(p.id,'CLOSED')}>Close poll</button>}{(p.status==='DRAFT'||p.status==='OPEN')&&<button disabled={busy} style={danger} onClick={()=>void transition(p.id,'CANCELLED')}>Cancel</button>}</div></article>)}</section></main>
}
const panel={background:'white',border:'1px solid #e5e7eb',borderRadius:16,padding:18,marginTop:18,display:'grid',gap:12} as const,row={display:'flex',gap:12,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap'} as const,item={padding:'14px 0',borderBottom:'1px solid #e5e7eb'} as const,button={padding:'10px 14px',border:0,borderRadius:9,background:'#111827',color:'white',fontWeight:700,cursor:'pointer'} as const,secondary={...button,background:'#475569'},danger={...button,background:'#991b1b'}
