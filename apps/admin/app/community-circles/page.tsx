'use client'

import {FormEvent,useCallback,useEffect,useState} from 'react'
import {ActionBar,DangerButton,EmptyState,ErrorState,FormField,PageHeader,PageShell,PrimaryButton,SecondaryButton,StatusPill} from '../../components/admin-ui'
import {adminApi,getAdminSession,type AdminSession} from '../../lib/aaraagate-api'

type Circle={id:string;name:string;description?:string|null;status:'ACTIVE'|'CLOSED';memberCount:number;postCount:number;createdAt:string;updatedAt:string}
const allowedRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER'])

export default function CommunityCirclesPage(){
  const[session,setSession]=useState<AdminSession|null>(null)
  const[circles,setCircles]=useState<Circle[]>([])
  const[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('')
  const[name,setName]=useState(''),[description,setDescription]=useState('')

  const load=useCallback(async(s:AdminSession)=>{
    setLoading(true);setError('')
    try{setCircles(await adminApi<Circle[]>(s,'/community-circles/manage'))}
    catch(e){setError(e instanceof Error?e.message:'Could not load community circles')}
    finally{setLoading(false)}
  },[])

  useEffect(()=>{
    const s=getAdminSession();setSession(s)
    if(s&&allowedRoles.has(s.role))void load(s);else setLoading(false)
  },[load])

  async function create(e:FormEvent){
    e.preventDefault();if(!session||busy)return
    if(name.trim().length<3){setError('Circle name must have at least 3 characters.');return}
    setBusy(true);setError('');setSuccess('')
    try{
      await adminApi(session,'/community-circles',{method:'POST',body:JSON.stringify({name:name.trim(),description:description.trim()||undefined})})
      setName('');setDescription('');setSuccess('Community circle created. Residents may now opt in.');await load(session)
    }catch(e){setError(e instanceof Error?e.message:'Could not create community circle')}
    finally{setBusy(false)}
  }

  async function transition(circle:Circle,status:'ACTIVE'|'CLOSED'){
    if(!session||busy)return
    setBusy(true);setError('');setSuccess('')
    try{
      await adminApi(session,`/community-circles/${circle.id}/status`,{method:'POST',body:JSON.stringify({status})})
      setSuccess(status==='CLOSED'?'Circle closed. Existing members retain read-only history.':'Circle reopened for opt-in participation.')
      await load(session)
    }catch(e){setError(e instanceof Error?e.message:'Could not update community circle')}
    finally{setBusy(false)}
  }

  if(!session||!allowedRoles.has(session.role))return <PageShell><PageHeader title="Community circle access required" description="A society community-management role is required." actions={<a href="/">Return to Admin</a>}/></PageShell>

  return <PageShell>
    <PageHeader
      context={`${session.societyName??'Current society'} · ${session.role.replaceAll('_',' ')}`}
      title="Community circles"
      description="Create opt-in resident interest circles without exposing a resident member directory or turning Community into a promotional feed."
      actions={<a href="/governance">Governance workspace</a>}
    />
    {error&&<ErrorState title="Community circle operation failed" description={error}/>}
    <ActionBar feedback={success}><SecondaryButton loading={loading} disabled={busy} onClick={()=>void load(session)}>Refresh</SecondaryButton></ActionBar>

    <form onSubmit={create} style={panel}>
      <h2>Create society-managed circle</h2>
      <FormField label="Circle name" required maxLength={80} value={name} onChange={e=>setName(e.target.value)}/>
      <FormField label="Description" multiline maxLength={500} value={description} onChange={e=>setDescription(e.target.value)}/>
      <PrimaryButton type="submit" loading={busy}>Create circle</PrimaryButton>
      <small>Residents choose whether to join. Posts are visible only to joined residents, and resident identities are not exposed as a member directory.</small>
    </form>

    <section style={panel}>
      <h2>Circle lifecycle</h2>
      {loading?<p>Loading community circles…</p>:circles.length===0?<EmptyState title="No community circles"/>:
        <div style={list}>{circles.map(circle=><article key={circle.id} style={item}>
          <div style={{display:'grid',gap:5,flex:'1 1 520px'}}>
            <div style={row}><strong>{circle.name}</strong><StatusPill label={circle.status} tone={circle.status==='ACTIVE'?'success':'neutral'}/></div>
            {circle.description&&<span>{circle.description}</span>}
            <small>{circle.memberCount} opted in · {circle.postCount} posts · created {new Date(circle.createdAt).toLocaleDateString('en-IN')}</small>
          </div>
          <ActionBar label={`Actions for ${circle.name}`}>
            {circle.status==='CLOSED'
              ? <PrimaryButton disabled={busy} onClick={()=>void transition(circle,'ACTIVE')}>Reopen</PrimaryButton>
              : <DangerButton disabled={busy} onClick={()=>void transition(circle,'CLOSED')}>Close</DangerButton>}
          </ActionBar>
        </article>)}</div>}
    </section>
  </PageShell>
}

const panel={display:'grid',gap:12,padding:18,border:'1px solid var(--line,#d5e8eb)',borderRadius:16,background:'var(--surface,#fff)'} as const
const list={display:'grid',gap:10} as const
const item={display:'flex',gap:16,justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',padding:14,border:'1px solid var(--line,#e5e7eb)',borderRadius:14} as const
const row={display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'} as const
