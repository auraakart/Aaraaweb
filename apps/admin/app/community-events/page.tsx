'use client'

import {FormEvent,useEffect,useState} from 'react'
import {ActionBar,DangerButton,EmptyState,ErrorState,FormField,PageHeader,PageShell,PrimaryButton,SecondaryButton,SelectField,StatusPill} from '../../components/admin-ui'
import {api,type Session} from '../../lib/admin-client'

type CommunityEvent={
  id:string;title:string;description?:string|null;audienceScope:'COMMUNITY'|'OWNER_ONLY';
  status:'DRAFT'|'PUBLISHED'|'CANCELLED';startsAt:string;endsAt:string;location?:string|null;
  capacity?:number|null;goingCount:number;notGoingCount:number;
}

const allowedRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER'])
function session():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw):null}catch{return null}}
const human=(value:string)=>value.replaceAll('_',' ')
const iso=(value:string)=>new Date(value).toISOString()

export default function CommunityEventsPage(){
  const s=typeof window==='undefined'?null:session();const allowed=!!s&&allowedRoles.has(s.role)
  const[events,setEvents]=useState<CommunityEvent[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('')
  const[title,setTitle]=useState(''),[description,setDescription]=useState(''),[audience,setAudience]=useState<'COMMUNITY'|'OWNER_ONLY'>('COMMUNITY')
  const[startsAt,setStartsAt]=useState(''),[endsAt,setEndsAt]=useState(''),[location,setLocation]=useState(''),[capacity,setCapacity]=useState('')

  async function load(){if(!s||!allowed)return;setLoading(true);setError('');try{setEvents(await api<CommunityEvent[]>('/community-events/manage',{},s))}catch(e){setError(e instanceof Error?e.message:'Could not load community events')}finally{setLoading(false)}}
  useEffect(()=>{void load()},[])

  async function create(e:FormEvent){e.preventDefault();if(!s)return;setError('');setSuccess('')
    if(!startsAt||!endsAt){setError('Start and end are required.');return}
    const cap=capacity.trim()===''?undefined:Number(capacity)
    if(cap!==undefined&&(!Number.isInteger(cap)||cap<1||cap>10000)){setError('Capacity must be 1–10000 or blank.');return}
    if(new Date(endsAt)<=new Date(startsAt)){setError('End must be after start.');return}
    setBusy(true)
    try{
      await api('/community-events',{method:'POST',body:JSON.stringify({title:title.trim(),description:description.trim()||undefined,audienceScope:audience,startsAt:iso(startsAt),endsAt:iso(endsAt),location:location.trim()||undefined,capacity:cap})},s)
      setTitle('');setDescription('');setStartsAt('');setEndsAt('');setLocation('');setCapacity('');setAudience('COMMUNITY');setSuccess('Community event draft created.');await load()
    }catch(e){setError(e instanceof Error?e.message:'Could not create community event')}finally{setBusy(false)}
  }

  async function transition(id:string,status:'PUBLISHED'|'CANCELLED'){if(!s)return;setBusy(true);setError('');setSuccess('')
    try{await api('/community-events/'+id+'/status',{method:'POST',body:JSON.stringify({status})},s);setSuccess(status==='PUBLISHED'?'Community event published.':'Community event cancelled.');await load()}
    catch(e){setError(e instanceof Error?e.message:'Could not update community event')}finally{setBusy(false)}
  }

  if(!s||!allowed)return <PageShell><PageHeader title="Community event access required" actions={<a href="/">Return to Admin</a>}/></PageShell>
  return <PageShell>
    <PageHeader context={(s.societyName??'Current society')+' · '+human(s.role)} title="Community events" description="Publish non-statutory society activities and review privacy-preserving aggregate RSVP capacity. This is not governance attendance or voting." actions={<a href="/governance">Governance workspace</a>}/>
    {error&&<ErrorState title="Community event operation failed" description={error}/>}
    <ActionBar feedback={success}><SecondaryButton loading={loading} disabled={busy} onClick={()=>void load()}>Refresh</SecondaryButton></ActionBar>
    <form onSubmit={create} style={panel}>
      <h2>Create event draft</h2>
      <FormField label="Title" required maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/>
      <FormField label="Description" multiline maxLength={3000} value={description} onChange={e=>setDescription(e.target.value)}/>
      <SelectField label="Audience" value={audience} onChange={e=>setAudience(e.target.value as typeof audience)}><option value="COMMUNITY">All current owners & occupants</option><option value="OWNER_ONLY">Current verified owners only</option></SelectField>
      <div style={grid}><FormField label="Starts at" required type="datetime-local" value={startsAt} onChange={e=>setStartsAt(e.target.value)}/><FormField label="Ends at" required type="datetime-local" value={endsAt} onChange={e=>setEndsAt(e.target.value)}/></div>
      <div style={grid}><FormField label="Location" maxLength={240} value={location} onChange={e=>setLocation(e.target.value)}/><FormField label="Capacity (optional)" type="number" min="1" max="10000" value={capacity} onChange={e=>setCapacity(e.target.value)}/></div>
      <PrimaryButton type="submit" loading={busy}>Create draft</PrimaryButton>
    </form>
    <section style={panel}>
      <h2>Event lifecycle & RSVP capacity</h2>
      {loading?<p>Loading community events…</p>:events.length===0?<EmptyState title="No community events"/>:<div style={list}>{events.map(event=><article key={event.id} style={item}>
        <div style={{display:'grid',gap:5,flex:'1 1 540px'}}>
          <div style={row}><strong>{event.title}</strong><StatusPill label={human(event.status)} tone={event.status==='PUBLISHED'?'success':event.status==='CANCELLED'?'danger':'neutral'}/><StatusPill label={human(event.audienceScope)} tone="info"/></div>
          {event.description&&<span>{event.description}</span>}
          <small>{new Date(event.startsAt).toLocaleString('en-IN')} → {new Date(event.endsAt).toLocaleString('en-IN')}{event.location?' · '+event.location:''}</small>
          <small>RSVP aggregate: {event.goingCount} going · {event.notGoingCount} not going{event.capacity?' · capacity '+event.capacity:''}</small>
        </div>
        <ActionBar label={'Actions for '+event.title}>
          {event.status==='DRAFT'&&<PrimaryButton disabled={busy} onClick={()=>void transition(event.id,'PUBLISHED')}>Publish</PrimaryButton>}
          {event.status!=='CANCELLED'&&<DangerButton disabled={busy} onClick={()=>void transition(event.id,'CANCELLED')}>Cancel</DangerButton>}
        </ActionBar>
      </article>)}</div>}
    </section>
  </PageShell>
}

const panel={display:'grid',gap:12,padding:18,border:'1px solid var(--line,#d5e8eb)',borderRadius:16,background:'var(--surface,#fff)'} as const
const grid={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12} as const
const list={display:'grid',gap:10} as const
const item={display:'flex',gap:16,justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',padding:14,border:'1px solid var(--line,#e5e7eb)',borderRadius:14} as const
const row={display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'} as const
