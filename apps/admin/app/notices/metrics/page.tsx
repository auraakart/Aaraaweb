'use client'

import { useEffect, useMemo, useState } from 'react'
import { api, type Session } from '../../../lib/admin-client'

type Notice={id:string;title:string;category?:string|null;status:string;publishedAt?:string|null;importance?:string;requiresAcknowledgement?:boolean;audience:string}
type DeliverySummary={
  noticeId:string
  noticeStatus:string
  publishedAt?:string|null
  expiresAt?:string|null
  requiresAcknowledgement:boolean
  recipientSnapshot:{total:number}
  pushHandoff:{trackedRecipients:number;untrackedRecipients:number;pending:number;inFlight:number;successful:number;retrying:number;attemptedRecipients:number;totalAttempts:number}
  engagement:{read:number;unread:number;acknowledged:number;pendingAcknowledgement:number}
  semantics:{coverage:string;pushHandoff:string;read:string;legalService:string}
}

const roles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER'])
function getSession():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw) as Session:null}catch{return null}}
const fmt=(value?:string|null)=>value?new Date(value).toLocaleString('en-IN'):'—'

export default function NoticeMetricsPage(){
  const session=typeof window==='undefined'?null:getSession()
  const canUse=!!session&&roles.has(session.role)
  const[notices,setNotices]=useState<Notice[]>([])
  const[selectedId,setSelectedId]=useState('')
  const[summary,setSummary]=useState<DeliverySummary|null>(null)
  const[busy,setBusy]=useState(false)
  const[error,setError]=useState('')
  const selected=useMemo(()=>notices.find(n=>n.id===selectedId)??null,[notices,selectedId])

  async function loadNotices(){if(!session||!canUse)return;setBusy(true);setError('');try{const rows=await api<Notice[]>('/notices/manage',{},session);setNotices(rows);const first=selectedId||rows[0]?.id||'';setSelectedId(first);if(first)await loadSummary(first)}catch(e){setError(e instanceof Error?e.message:'Could not load notices')}finally{setBusy(false)}}
  async function loadSummary(id:string){if(!session||!id)return;setBusy(true);setError('');try{setSummary(await api<DeliverySummary>(`/notices/manage/${id}/delivery`,{},session))}catch(e){setSummary(null);setError(e instanceof Error?e.message:'Could not load notice metrics')}finally{setBusy(false)}}
  useEffect(()=>{void loadNotices()},[])
  useEffect(()=>{if(selectedId)void loadSummary(selectedId)},[selectedId])

  if(!session||!canUse)return <main style={{padding:32}}><h1>Notice metrics access required</h1><p>Notice-management access is required for this operational view.</p><a href="/">Return to Admin</a></main>

  return <main style={{maxWidth:1180,margin:'0 auto',padding:'28px 22px 80px'}}>
    <header><small>{session.societyName??'Current society'} · {session.role.replaceAll('_',' ')}</small><h1>Notice delivery & engagement</h1><p>Operational telemetry for recipient snapshots, durable push handoff, reads and acknowledgements. Handoff is not proof of device display, human reading or legal service.</p></header>
    {error&&<p style={err}>{error}</p>}
    <section style={panel}><div style={row}><label style={{minWidth:280,flex:1}}>Notice<select value={selectedId} onChange={e=>setSelectedId(e.target.value)} style={input}><option value="">Select a notice</option>{notices.map(n=><option key={n.id} value={n.id}>{n.title} · {n.status}</option>)}</select></label><button disabled={busy||!selectedId} onClick={()=>void loadSummary(selectedId)} style={button}>{busy?'Refreshing…':'Refresh metrics'}</button></div>{selected&&<p style={{marginBottom:0}}><strong>{selected.title}</strong> · {selected.category??'General'} · {selected.audience==='OWNER_ONLY'?'Owners only':'Owners and occupants'} · {selected.importance??'NORMAL'}</p>}</section>
    {!summary?<section style={{...panel,marginTop:18}}><p>{busy?'Loading metrics…':'Select a notice to review telemetry.'}</p></section>:<>
      <section style={{...panel,marginTop:18}}><div style={stats}><Metric label="Recipient snapshot" value={summary.recipientSnapshot.total}/><Metric label="Tracked handoff" value={summary.pushHandoff.trackedRecipients}/><Metric label="Untracked handoff" value={summary.pushHandoff.untrackedRecipients}/><Metric label="Handoff successful" value={summary.pushHandoff.successful}/><Metric label="Retrying" value={summary.pushHandoff.retrying}/><Metric label="In flight" value={summary.pushHandoff.inFlight}/></div></section>
      <section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:18,marginTop:18}}>
        <article style={panel}><h2>Push handoff</h2><Line label="Pending first attempt" value={summary.pushHandoff.pending}/><Line label="Attempted recipients" value={summary.pushHandoff.attemptedRecipients}/><Line label="Total attempts" value={summary.pushHandoff.totalAttempts}/><Line label="Successful handoff" value={summary.pushHandoff.successful}/><Line label="Retrying" value={summary.pushHandoff.retrying}/><p style={note}>{summary.semantics.coverage}</p><p style={note}>{summary.semantics.pushHandoff}</p></article>
        <article style={panel}><h2>Engagement</h2><Line label="Read" value={summary.engagement.read}/><Line label="Unread" value={summary.engagement.unread}/><Line label="Acknowledged" value={summary.engagement.acknowledged}/><Line label="Pending acknowledgement" value={summary.engagement.pendingAcknowledgement}/><p style={note}>{summary.semantics.read}</p></article>
        <article style={panel}><h2>Notice state</h2><Line label="Status" value={summary.noticeStatus}/><Line label="Published" value={fmt(summary.publishedAt)}/><Line label="Expires" value={fmt(summary.expiresAt)}/><Line label="Acknowledgement required" value={summary.requiresAcknowledgement?'Yes':'No'}/><p style={warning}>{summary.semantics.legalService}</p></article>
      </section>
    </>}
    <p style={{marginTop:22}}><a href="/">← Back to Admin</a></p>
  </main>
}

function Metric({label,value}:{label:string;value:number}){return <div style={metric}><b>{value}</b><span>{label}</span></div>}
function Line({label,value}:{label:string;value:string|number}){return <div style={{display:'flex',justifyContent:'space-between',gap:16,padding:'9px 0',borderBottom:'1px solid #eef2f7'}}><span>{label}</span><strong>{value}</strong></div>}
const panel={background:'#fff',border:'1px solid #e5e7eb',borderRadius:18,padding:20,boxShadow:'0 8px 24px rgba(15,23,42,.05)'}
const row={display:'flex',alignItems:'end',justifyContent:'space-between',gap:14,flexWrap:'wrap' as const}
const input={display:'block',width:'100%',marginTop:6,padding:'10px 12px',border:'1px solid #cbd5e1',borderRadius:10,boxSizing:'border-box' as const}
const button={border:0,borderRadius:10,padding:'11px 15px',background:'#05879A',color:'#fff',fontWeight:700,cursor:'pointer'}
const stats={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12}
const metric={display:'flex',flexDirection:'column' as const,gap:5,padding:14,borderRadius:14,background:'#f8fafc'}
const note={fontSize:13,lineHeight:1.5,color:'#475569',marginTop:14}
const warning={fontSize:13,lineHeight:1.5,color:'#92400e',background:'#fffbeb',border:'1px solid #fde68a',borderRadius:10,padding:12,marginTop:16}
const err={background:'#fff1f2',border:'1px solid #fecdd3',padding:12,borderRadius:10,color:'#9f1239'}
