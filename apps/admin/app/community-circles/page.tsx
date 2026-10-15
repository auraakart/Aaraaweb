'use client'

import {FormEvent,useCallback,useEffect,useState} from 'react'
import {ActionBar,DangerButton,EmptyState,ErrorState,FormField,PageHeader,PageShell,PrimaryButton,SecondaryButton,StatusPill} from '../../components/admin-ui'
import {adminApi,getAdminSession,type AdminSession} from '../../lib/aaraagate-api'

type Circle={id:string;name:string;description?:string|null;status:'ACTIVE'|'CLOSED'|'PENDING'|'REJECTED';memberCount:number;postCount:number;expiresAt?:string|null;requestedByName?:string;reviewNote?:string|null}
type Report={id:string;circleId:string;postId:string;reason:string;status:'OPEN'|'RESOLVED';body:string;senderName:string;senderFlat:string;hidden:boolean;circleName:string}
const allowedRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER'])
function localDate(value?:string|null){
  if(!value)return ''
  const d=new Date(value)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}
function expiryValue(value:string){
  if(!value)return null
  const date=new Date(value)
  if(!Number.isFinite(date.getTime())||date.getTime()<=Date.now())throw new Error('Choose a future deletion date.')
  return date.toISOString()
}

export default function CommunityCirclesPage(){
  const[session,setSession]=useState<AdminSession|null>(null)
  const[circles,setCircles]=useState<Circle[]>([]),[reports,setReports]=useState<Report[]>([])
  const[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('')
  const[name,setName]=useState(''),[description,setDescription]=useState(''),[expiresAt,setExpiresAt]=useState('')
  const[notes,setNotes]=useState<Record<string,string>>({}),[dates,setDates]=useState<Record<string,string>>({})
  const load=useCallback(async(s:AdminSession)=>{
    setLoading(true);setError('')
    try{
      const[data,queue]=await Promise.all([adminApi<Circle[]>(s,'/community-circles/manage'),adminApi<Report[]>(s,'/community-circles/reports/manage')])
      setCircles(data);setReports(queue);setDates(Object.fromEntries(data.map(c=>[c.id,localDate(c.expiresAt)])))
    }catch(e){setError(e instanceof Error?e.message:'Could not load community circles')}
    finally{setLoading(false)}
  },[])
  useEffect(()=>{const s=getAdminSession();setSession(s);if(s&&allowedRoles.has(s.role))void load(s);else setLoading(false)},[load])
  async function action(path:string,body:object,message:string){
    if(!session||busy)return
    setBusy(true);setError('');setSuccess('')
    try{await adminApi(session,path,{method:'POST',body:JSON.stringify(body)});setSuccess(message);await load(session)}
    catch(e){setError(e instanceof Error?e.message:'Community circle operation failed')}
    finally{setBusy(false)}
  }
  async function create(e:FormEvent){
    e.preventDefault();if(!session||busy)return
    try{
      if(name.trim().length<3)throw new Error('Circle name must have at least 3 characters.')
      const deletion=expiryValue(expiresAt);setBusy(true);setError('');setSuccess('')
      await adminApi(session,'/community-circles',{method:'POST',body:JSON.stringify({name:name.trim(),description:description.trim()||undefined,expiresAt:deletion})})
      setName('');setDescription('');setExpiresAt('');setSuccess('Community circle published. Residents may now opt in.');await load(session)
    }catch(e){setError(e instanceof Error?e.message:'Could not create community circle')}
    finally{setBusy(false)}
  }
  async function review(c:Circle,decision:'APPROVE'|'REJECT'){
    const reason=(notes[c.id]??'').trim();if(reason.length<3){setError('Enter a review reason.');return}
    await action(`/community-circles/${c.id}/review`,{decision,reason},decision==='APPROVE'?'Request approved and published.':'Request rejected. The resident can see your reason.')
  }
  async function saveExpiry(c:Circle){
    try{await action(`/community-circles/${c.id}/expiry`,{expiresAt:expiryValue(dates[c.id]??'')},'Deletion schedule updated.')}
    catch(e){setError(e instanceof Error?e.message:'Invalid deletion date')}
  }
  async function moderate(r:Report,hidden:boolean){
    const reason=(notes[r.id]??'').trim();if(reason.length<3){setError('Enter a moderation reason.');return}
    await action(`/community-circles/${r.circleId}/posts/${r.postId}/moderate`,{hidden,reason},hidden?'Message hidden from members.':'Message visible; reports resolved.')
  }
  if(!session||!allowedRoles.has(session.role))return <PageShell><PageHeader title="Community circle access required" description="A society community-management role is required." actions={<a href="/">Return to Admin</a>}/></PageShell>
  return <PageShell>
    <PageHeader context={`${session.societyName??'Current society'} · ${session.role.replaceAll('_',' ')}`} title="Community circles"
      description="Approve resident circle requests, manage deletion dates and moderate reported messages. Sender names and flats are visible within joined circles."
      actions={<a href="/governance">Governance workspace</a>}/>
    {error&&<ErrorState title="Community circle operation failed" description={error}/>}
    <ActionBar feedback={success}><SecondaryButton loading={loading} disabled={busy} onClick={()=>void load(session)}>Refresh</SecondaryButton></ActionBar>
    <form onSubmit={create} style={panel}>
      <h2>Create society-managed circle</h2>
      <FormField label="Circle name" required maxLength={80} value={name} disabled={busy} onChange={e=>setName(e.target.value)}/>
      <FormField label="Description" multiline maxLength={500} value={description} disabled={busy} onChange={e=>setDescription(e.target.value)}/>
      <FormField label="Automatic deletion date (optional)" type="datetime-local" value={expiresAt} disabled={busy} onChange={e=>setExpiresAt(e.target.value)} hint="Local date and time. Leave blank to keep the circle. At expiry the circle, messages, memberships and reports are permanently deleted."/>
      <PrimaryButton type="submit" loading={busy}>Create circle</PrimaryButton>
      <small>Authorised managers publish directly. Resident requests require approval. Residents choose whether to join.</small>
    </form>
    <section style={panel}><h2>Resident circle requests</h2>
      {loading?<p>Loading requests…</p>:circles.filter(c=>['PENDING','REJECTED'].includes(c.status)).length===0?<EmptyState title="No circle requests"/>:circles.filter(c=>['PENDING','REJECTED'].includes(c.status)).map(c=><article key={c.id} style={panel}>
        <div style={row}><strong>{c.name}</strong><StatusPill label={c.status} tone={c.status==='PENDING'?'warning':'neutral'}/></div>
        <span>{c.description}</span><small>Requested by {c.requestedByName}</small>{c.reviewNote&&<p>Review: {c.reviewNote}</p>}
        {c.status==='PENDING'&&<><FormField label={`Review reason for ${c.name}`} maxLength={500} value={notes[c.id]??''} disabled={busy} onChange={e=>setNotes({...notes,[c.id]:e.target.value})}/>
          <ActionBar><PrimaryButton disabled={busy} onClick={()=>void review(c,'APPROVE')}>Approve and publish</PrimaryButton><DangerButton disabled={busy} onClick={()=>void review(c,'REJECT')}>Reject</DangerButton></ActionBar></>}
      </article>)}
    </section>
    <section style={panel}><h2>Circle lifecycle</h2>
      {loading?<p>Loading circles…</p>:circles.filter(c=>['ACTIVE','CLOSED'].includes(c.status)).length===0?<EmptyState title="No published circles"/>:circles.filter(c=>['ACTIVE','CLOSED'].includes(c.status)).map(c=><article key={c.id} style={panel}>
        <div style={row}><strong>{c.name}</strong><StatusPill label={c.status} tone={c.status==='ACTIVE'?'success':'neutral'}/></div>
        {c.description&&<span>{c.description}</span>}<small>{c.memberCount} opted in · {c.postCount} posts</small>
        <FormField label={`Automatic deletion date for ${c.name}`} type="datetime-local" value={dates[c.id]??''} disabled={busy} onChange={e=>setDates({...dates,[c.id]:e.target.value})} hint="Optional. Clearing and saving removes the schedule. Expiry permanently deletes all circle content."/>
        <ActionBar><SecondaryButton disabled={busy} onClick={()=>void saveExpiry(c)}>Save deletion date</SecondaryButton>
          {c.status==='CLOSED'?<PrimaryButton disabled={busy} onClick={()=>void action(`/community-circles/${c.id}/status`,{status:'ACTIVE'},'Circle reopened.')}>Reopen</PrimaryButton>
            :<DangerButton disabled={busy} onClick={()=>void action(`/community-circles/${c.id}/status`,{status:'CLOSED'},'Circle closed. Members retain read-only history.')}>Close</DangerButton>}
        </ActionBar>
      </article>)}
    </section>
    <section style={panel}><h2>Reported messages</h2>
      {loading?<p>Loading reports…</p>:reports.length===0?<EmptyState title="No reported messages"/>:reports.map(r=><article key={r.id} style={panel}>
        <div style={row}><strong>{r.circleName}</strong><StatusPill label={r.status} tone={r.status==='OPEN'?'warning':'neutral'}/></div>
        <small>{r.senderName} · {r.senderFlat} · {r.hidden?'Hidden':'Visible'}</small><p>{r.body}</p><p>Report: {r.reason}</p>
        <FormField label={`Moderation reason for report ${r.id}`} maxLength={500} value={notes[r.id]??''} disabled={busy} onChange={e=>setNotes({...notes,[r.id]:e.target.value})}/>
        <ActionBar>{r.hidden?<SecondaryButton disabled={busy} onClick={()=>void moderate(r,false)}>Restore message</SecondaryButton>
          :<><DangerButton disabled={busy} onClick={()=>void moderate(r,true)}>Hide message</DangerButton>{r.status==='OPEN'&&<SecondaryButton disabled={busy} onClick={()=>void moderate(r,false)}>Keep message and resolve</SecondaryButton>}</>}
        </ActionBar>
      </article>)}
    </section>
  </PageShell>
}
const panel={display:'grid',gap:12,padding:18,border:'1px solid var(--line,#d5e8eb)',borderRadius:16,background:'var(--surface,#fff)'} as const
const row={display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'} as const
