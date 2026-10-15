'use client'

import {useEffect,useState} from 'react'
import { ActionBar, DangerButton, EmptyState, ErrorState, PageHeader, PageShell, PrimaryButton, SecondaryButton, StatusPill } from '../../../components/admin-ui'
import { api, type Session } from '../../../lib/admin-client'

type Option={id:string;ordinal:number;label:string}
type Poll={id:string;pollType:'ADVISORY'|'SURVEY';status:'DRAFT'|'OPEN'|'CLOSED'|'CANCELLED';title:string;description?:string|null;opensAt?:string|null;closesAt?:string|null;statutoryUseProhibited:boolean;options:Option[]}
const roles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER'])
function session():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw):null}catch{return null}}
const human=(v:string)=>v.replaceAll('_',' ')

export default function GovernancePollsPage(){
 const s=typeof window==='undefined'?null:session();const allowed=!!s&&roles.has(s.role)
 const[polls,setPolls]=useState<Poll[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[success,setSuccess]=useState('')
 async function load(){if(!s||!allowed)return;setLoading(true);setError('');try{setPolls(await api<Poll[]>('/governance/polls',{},s))}catch(e){setError(e instanceof Error?e.message:'Could not load polls')}finally{setLoading(false)}}
 useEffect(()=>{void load()},[])
 async function transition(id:string,status:'OPEN'|'CLOSED'|'CANCELLED'){if(!s)return;setBusy(true);setError('');setSuccess('');try{await api(`/governance/community-polls/${id}/status`,{method:'POST',body:JSON.stringify({status})},s);setSuccess(`Poll ${status.toLowerCase()}.`);await load()}catch(e){setError(e instanceof Error?e.message:'Could not update poll')}finally{setBusy(false)}}

 if(!s||!allowed)return <PageShell><PageHeader title="Governance access required" actions={<a href="/">Return to Admin</a>}/></PageShell>
 return <PageShell>
  <PageHeader
    context={`${s.societyName??'Current society'} · ${human(s.role)}`}
    title="Community polls"
    description="Manage advisory and survey polls. These controls are intentionally separated from statutory society voting and legal resolutions."
    actions={<a href="/governance">← Governance workspace</a>}
  />
  {error&&<ErrorState title="Poll operation failed" description={error}/>}
  <ActionBar feedback={success} label="Poll lifecycle actions"><SecondaryButton loading={loading} disabled={busy} onClick={()=>void load()}>Refresh</SecondaryButton></ActionBar>
  <section style={panel} aria-labelledby="poll-lifecycle-heading">
    <div style={header}><div><h2 id="poll-lifecycle-heading">Poll lifecycle</h2><p style={muted}>Advisory/survey only. Statutory use remains prohibited.</p></div><StatusPill label="NON-STATUTORY" tone="warning"/></div>
    {loading?<p>Loading polls…</p>:polls.length===0?<EmptyState title="No polls have been created"/>:<div style={list}>{polls.map(p=><article key={p.id} style={item}>
      <div style={content}><div style={titleRow}><strong>{p.title}</strong><StatusPill label={human(p.status)} tone={p.status==='OPEN'?'success':p.status==='CANCELLED'?'danger':'neutral'}/><StatusPill label={human(p.pollType)} tone="info"/></div>
        <p>{p.description||`${p.pollType.toLowerCase()} poll`}</p>
        <small>Non-statutory use enforced: {p.statutoryUseProhibited?'Yes':'No'}</small>
        <ol>{p.options.map(o=><li key={o.id}>{o.label}</li>)}</ol>
      </div>
      <ActionBar label={`Actions for ${p.title}`}>
        {p.status==='DRAFT'&&<PrimaryButton disabled={busy} onClick={()=>void transition(p.id,'OPEN')}>Open poll</PrimaryButton>}
        {p.status==='OPEN'&&<PrimaryButton disabled={busy} onClick={()=>void transition(p.id,'CLOSED')}>Close poll</PrimaryButton>}
        {(p.status==='DRAFT'||p.status==='OPEN')&&<DangerButton disabled={busy} onClick={()=>void transition(p.id,'CANCELLED')}>Cancel</DangerButton>}
      </ActionBar>
    </article>)}</div>}
  </section>
 </PageShell>
}
const panel={display:'grid',gap:12,padding:18,border:'1px solid var(--line,#d5e8eb)',borderRadius:16,background:'var(--surface,#fff)'} as const
const header={display:'flex',gap:12,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap'} as const
const muted={margin:0,color:'var(--muted,#64748b)'} as const
const list={display:'grid',gap:10} as const
const item={display:'flex',justifyContent:'space-between',gap:16,alignItems:'flex-start',padding:14,border:'1px solid var(--line,#e5e7eb)',borderRadius:14,flexWrap:'wrap'} as const
const content={display:'grid',gap:4,flex:'1 1 500px'} as const
const titleRow={display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'} as const
