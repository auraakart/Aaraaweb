'use client'

import { FormEvent, useEffect, useState } from 'react'

type Session={accessToken:string;role:string;societyName?:string}
type AssistantResult={intent:string;answer:string;facts:unknown;sources:string[];grounded:boolean;mutationPerformed:boolean}
type NoticeDraft={title:string;body:string;language:string;humanApprovalRequired:boolean;mutationPerformed:boolean}
type AuditItem={id:string;actorUserId:string;action:string;status:string;confirmedAt?:string|null;executedAt?:string|null;createdAt:string}

const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
function session():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw) as Session:null}catch{return null}}
async function api<T>(s:Session,path:string,init:RequestInit={}):Promise<T>{
  const r=await fetch(`${base}/api/v1${path}`,{...init,headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.accessToken}`,...init.headers}})
  const t=await r.text();const b=t?JSON.parse(t):null
  if(!r.ok)throw new Error(b?.message??`Request failed (${r.status})`)
  return b as T
}

export default function AiAssistantPage(){
  const[s,setSession]=useState<Session|null>(null),[message,setMessage]=useState(''),[result,setResult]=useState<AssistantResult|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const[topic,setTopic]=useState(''),[language,setLanguage]=useState<'en-IN'|'hi-IN'|'ta-IN'>('en-IN'),[draft,setDraft]=useState<NoticeDraft|null>(null),[audit,setAudit]=useState<AuditItem[]>([])
  useEffect(()=>{const current=session();setSession(current);if(current&&['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER','ACCOUNTANT','AUDITOR','SECURITY_SUPERVISOR'].includes(current.role)){void loadAudit(current)}},[])
  async function loadAudit(current:Session){try{const data=await api<{items:AuditItem[]}>(current,'/ai-operations/assistant/audit?page=1&pageSize=20');setAudit(data.items)}catch{/* audit is permission-dependent; assistant remains usable without it */}}
  async function ask(e:FormEvent){e.preventDefault();if(!s||message.trim().length<2)return;setBusy(true);setError('');setResult(null);try{setResult(await api<AssistantResult>(s,'/ai-operations/assistant/query',{method:'POST',body:JSON.stringify({message:message.trim()})}))}catch(e){setError(e instanceof Error?e.message:'Assistant request failed')}finally{setBusy(false)}}
  async function draftNotice(e:FormEvent){e.preventDefault();if(!s||topic.trim().length<3)return;setBusy(true);setError('');try{setDraft(await api<NoticeDraft>(s,'/ai-operations/assistant/notice-draft',{method:'POST',body:JSON.stringify({topic:topic.trim(),language})}))}catch(e){setError(e instanceof Error?e.message:'Notice draft failed')}finally{setBusy(false)}}
  if(!s)return <main style={{padding:32}}><h1>Sign in required</h1><a href="/">Return to Admin</a></main>
  return <main style={{maxWidth:1120,margin:'0 auto',padding:'28px 22px 80px'}}>
    <header><small>{s.societyName??'Current society'} · {s.role.replaceAll('_',' ')}</small><h1 style={{marginBottom:8}}>Aaraagate Assistant</h1><p style={{maxWidth:820}}>Permission-aware operational assistance grounded in current Aaraagate records. The assistant cannot mutate domain data directly. Resident actions use explicit proposals and confirmation; admin drafting is human-review only.</p><a href="/">← Admin console</a></header>
    {error&&<div style={errorBox}>{error}</div>}
    <section style={panel}><h2>Ask operations</h2><p>Try finance ageing, helpdesk SLA, security incidents, facilities, vendors or procurement. Unsupported questions return no invented answer.</p><form onSubmit={ask}><textarea value={message} onChange={e=>setMessage(e.target.value)} rows={4} placeholder="Example: Show overdue maintenance above ₹5000" style={textarea}/><button disabled={busy||message.trim().length<2} style={button}>{busy?'Checking…':'Ask assistant'}</button></form>{result&&<div style={resultBox}><strong>{result.answer}</strong><p><small>Intent: {result.intent} · grounded: {String(result.grounded)} · mutation: {String(result.mutationPerformed)}</small></p><pre style={pre}>{JSON.stringify(result.facts,null,2)}</pre><small>Sources: {result.sources.join(', ')||'None'}</small></div>}</section>
    <section style={panel}><h2>Draft a notice</h2><p>This produces copy only. It never publishes a notice and always requires human review.</p><form onSubmit={draftNotice} style={{display:'grid',gap:12}}><textarea value={topic} onChange={e=>setTopic(e.target.value)} rows={3} placeholder="Example: Water shutdown from 10 AM to 1 PM for pump maintenance" style={textarea}/><select value={language} onChange={e=>setLanguage(e.target.value as typeof language)} style={input}><option value="en-IN">English</option><option value="hi-IN">Hindi</option><option value="ta-IN">Tamil</option></select><button disabled={busy||topic.trim().length<3} style={button}>Create review draft</button></form>{draft&&<div style={resultBox}><h3>{draft.title}</h3><p>{draft.body}</p><small>Human approval required · no mutation performed</small></div>}</section>
    {audit.length>0&&<section style={panel}><h2>Recent AI action evidence</h2><p>Payload text is intentionally excluded from this audit view.</p><div style={{display:'grid',gap:8}}>{audit.map(item=><div key={item.id} style={auditRow}><div><strong>{item.action.replaceAll('_',' ')}</strong><div><small>{item.status} · {new Date(item.createdAt).toLocaleString('en-IN')}</small></div></div><code>{item.id.slice(0,8)}…</code></div>)}</div></section>}
  </main>
}

const panel={background:'white',border:'1px solid #e5e7eb',borderRadius:18,padding:20,marginTop:18,boxShadow:'0 8px 24px rgba(15,23,42,.05)'} as const
const textarea={width:'100%',padding:'12px 14px',border:'1px solid #cbd5e1',borderRadius:12,boxSizing:'border-box',font:'inherit',marginBottom:12} as const
const input={padding:'10px 12px',border:'1px solid #cbd5e1',borderRadius:10,maxWidth:220} as const
const button={padding:'11px 16px',border:0,borderRadius:10,background:'#111827',color:'white',fontWeight:800,cursor:'pointer'} as const
const resultBox={marginTop:16,padding:16,borderRadius:14,background:'#f8fafc'} as const
const errorBox={marginTop:18,padding:14,borderRadius:12,background:'#fee2e2',color:'#991b1b'} as const
const pre={whiteSpace:'pre-wrap',wordBreak:'break-word',fontSize:12,background:'#fff',padding:12,borderRadius:10,border:'1px solid #e2e8f0'} as const
const auditRow={display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',padding:'10px 0',borderBottom:'1px solid #e5e7eb'} as const
