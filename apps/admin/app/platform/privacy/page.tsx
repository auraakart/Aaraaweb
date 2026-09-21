'use client'

import { FormEvent,useCallback,useEffect,useMemo,useState } from 'react'
import {
  ActionBar,DangerButton,EmptyState,ErrorState,EvidenceGrid,FormField,PageHeader,PageShell,
  PrimaryButton,SecondaryButton,SelectField,StatusPill,
} from '../../../components/admin-ui'

type Session={accessToken:string;role:string}
type PrivacyCase={
  id:string
  subjectUserId:string
  subjectName?:string|null
  subjectPhone?:string|null
  requestType:'ACCESS'|'CORRECTION'|'ERASURE'|'OTHER'
  status:'OPEN'|'IN_REVIEW'|'WAITING'|'COMPLETED'|'REJECTED'|'CANCELLED'
  requestSummary:string
  legalHold:boolean
  retentionReason?:string|null
  retentionDecision?:'ALLOW'|'BLOCK'|null
  retentionDecisionReason?:string|null
  createdAt:string
  updatedAt:string
}
type ErasurePlan={executable:boolean;blockers:string[];erase:string[];retain:string[]}

const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
function getSession():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw) as Session:null}catch{return null}}
async function api<T>(s:Session,path:string,init:RequestInit={}):Promise<T>{
  const r=await fetch(`${base}/api/v1${path}`,{...init,headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.accessToken}`,...init.headers}})
  const text=await r.text();const body=text?JSON.parse(text):null
  if(!r.ok)throw new Error(Array.isArray(body?.message)?body.message.join(', '):body?.message??`Request failed (${r.status})`)
  return body as T
}
const human=(v:string)=>v.replaceAll('_',' ')

export default function PlatformPrivacyPage(){
  const[s,setS]=useState<Session|null>(null)
  const[cases,setCases]=useState<PrivacyCase[]>([])
  const[selectedId,setSelectedId]=useState('')
  const[loading,setLoading]=useState(true)
  const[busy,setBusy]=useState(false)
  const[error,setError]=useState('')
  const[success,setSuccess]=useState('')
  const[status,setStatus]=useState<PrivacyCase['status']>('IN_REVIEW')
  const[statusNote,setStatusNote]=useState('')
  const[holdReason,setHoldReason]=useState('')
  const[retentionDecision,setRetentionDecision]=useState<'ALLOW'|'BLOCK'>('BLOCK')
  const[retentionReason,setRetentionReason]=useState('')
  const[plan,setPlan]=useState<ErasurePlan|null>(null)
  const[erasureConfirmed,setErasureConfirmed]=useState(false)

  const selected=useMemo(()=>cases.find(x=>x.id===selectedId)??null,[cases,selectedId])

  const load=useCallback(async(x:Session)=>{
    setLoading(true);setError('')
    try{
      const rows=await api<PrivacyCase[]>(x,'/platform/privacy/cases')
      setCases(rows)
      setSelectedId(current=>current&&rows.some(row=>row.id===current)?current:rows[0]?.id??'')
    }catch(e){setError(e instanceof Error?e.message:'Privacy cases could not be loaded')}finally{setLoading(false)}
  },[])

  useEffect(()=>{const x=getSession();setS(x);if(x?.role==='SUPER_ADMIN')void load(x);else setLoading(false)},[load])
  useEffect(()=>{
    if(!selected)return
    setStatus(selected.status==='OPEN'?'IN_REVIEW':selected.status)
    setHoldReason(selected.retentionReason??'')
    setRetentionDecision(selected.retentionDecision??'BLOCK')
    setRetentionReason(selected.retentionDecisionReason??'')
    setStatusNote('');setPlan(null);setErasureConfirmed(false);setError('');setSuccess('')
  },[selectedId,selected?.status,selected?.retentionDecision])

  const run=async(task:()=>Promise<void>,message:string)=>{
    if(!s)return
    setBusy(true);setError('');setSuccess('')
    try{await task();setSuccess(message);await load(s)}
    catch(e){setError(e instanceof Error?e.message:'Platform privacy operation failed')}
    finally{setBusy(false)}
  }

  const updateStatus=(e:FormEvent)=>{e.preventDefault();if(!s||!selected)return
    void run(()=>api(s,`/platform/privacy/cases/${selected.id}/status`,{method:'PATCH',body:JSON.stringify({status,note:statusNote.trim()||undefined})}).then(()=>undefined),'Privacy case status updated.')
  }
  const updateRetention=(e:FormEvent)=>{e.preventDefault();if(!s||!selected||selected.requestType!=='ERASURE')return
    if(retentionReason.trim().length<3){setError('Enter a retention decision reason of at least 3 characters.');return}
    void run(()=>api(s,`/platform/privacy/cases/${selected.id}/retention-review`,{method:'PATCH',body:JSON.stringify({decision:retentionDecision,reason:retentionReason.trim()})}).then(()=>undefined),'Retention review updated.')
  }
  const updateHold=(e:FormEvent)=>{e.preventDefault();if(!s||!selected)return
    const next=!selected.legalHold
    if(next&&holdReason.trim().length<3){setError('Enter a retention reason of at least 3 characters.');return}
    void run(()=>api(s,`/platform/privacy/cases/${selected.id}/legal-hold`,{method:'PATCH',body:JSON.stringify({legalHold:next,retentionReason:next?holdReason.trim():undefined})}).then(()=>undefined),next?'Retention hold added.':'Retention hold released.')
  }
  const previewPlan=async()=>{if(!s||!selected||selected.requestType!=='ERASURE')return
    const id=selected.id
    setBusy(true);setError('');setPlan(null);setErasureConfirmed(false)
    try{
      const next=await api<ErasurePlan>(s,`/platform/privacy/cases/${selected.id}/erasure-plan`)
      if(selectedId===id)setPlan(next)
    }catch(e){setError(e instanceof Error?e.message:'Erasure plan could not be loaded')}
    finally{setBusy(false)}
  }
  const executeErasure=()=>{if(!s||!selected||selected.requestType!=='ERASURE'||!plan?.executable||!erasureConfirmed||selected.retentionDecision!=='ALLOW'||selected.legalHold)return
    void run(()=>api(s,`/platform/privacy/cases/${selected.id}/execute-erasure`,{method:'PATCH'}).then(()=>undefined),'Erasure/minimisation executed.')
  }

  if(loading)return <PageShell><PageHeader title="Independent-home privacy requests" description="Loading platform privacy requests…"/></PageShell>
  if(!s||s.role!=='SUPER_ADMIN')return <PageShell><PageHeader title="Platform access required" actions={<a href="/">Return to Admin</a>}/></PageShell>

  return <PageShell>
    <PageHeader
      title="Independent-home privacy requests"
      context="SUPER ADMIN · PRIVACY OPERATIONS"
      description="Society-less requests are processed here. Society privacy cases remain inside each society privacy workspace."
      actions={<a href="/">Admin console</a>}
    />
    {error&&<ErrorState title="Platform privacy operation failed" description={error}/>}
    <ActionBar feedback={success} label="Platform privacy actions">
      <SecondaryButton loading={loading} disabled={busy} onClick={()=>void load(s)}>Refresh</SecondaryButton>
    </ActionBar>

    {cases.length===0?<EmptyState title="No independent-home privacy requests" description="There are no platform privacy requests waiting."/>:<div style={layout}>
      <section style={listCard} aria-label="Platform privacy cases">
        {cases.map(row=><button key={row.id} type="button" aria-pressed={row.id===selectedId} onClick={()=>setSelectedId(row.id)} style={{...caseButton,...(row.id===selectedId?selectedStyle:{})}}>
          <span style={rowStyle}><StatusPill label={human(row.requestType)} tone={row.requestType==='ERASURE'?'warning':'info'}/><StatusPill label={human(row.status)} tone={row.status==='COMPLETED'?'success':row.status==='REJECTED'?'danger':'neutral'}/>{row.legalHold&&<StatusPill label="RETENTION HOLD" tone="warning"/>}</span>
          <strong>{row.requestSummary}</strong>
          <small>{[row.subjectName,row.subjectPhone].filter(Boolean).join(' · ')||row.subjectUserId}</small>
        </button>)}
      </section>

      <section style={detailCard} aria-label="Selected platform privacy case">
        {!selected?<EmptyState title="Select a privacy request"/>:<>
          <div style={rowStyle}><h2 style={{margin:0}}>{human(selected.requestType)}</h2><StatusPill label={human(selected.status)} tone={selected.status==='COMPLETED'?'success':selected.status==='REJECTED'?'danger':'info'}/></div>
          <p>{selected.requestSummary}</p>
          <EvidenceGrid items={[
            {id:'subject',label:'Subject',value:[selected.subjectName,selected.subjectPhone].filter(Boolean).join(' · ')||selected.subjectUserId},
            {id:'submitted',label:'Submitted',value:new Date(selected.createdAt).toLocaleString('en-IN')},
            {id:'retention-hold',label:'Retention hold',value:selected.legalHold?`Yes${selected.retentionReason?` · ${selected.retentionReason}`:''}`:'No'},
            ...(selected.requestType==='ERASURE'?[{id:'retention-review',label:'Retention review',value:`${selected.retentionDecision??'PENDING'}${selected.retentionDecisionReason?` · ${selected.retentionDecisionReason}`:''}`}]:[]),
          ]}/>

          {!['COMPLETED','REJECTED','CANCELLED'].includes(selected.status)&&<div style={forms}>
            <form onSubmit={updateStatus} style={formCard}><h3>Case decision</h3>
              <SelectField label="Status" value={status} onChange={e=>setStatus(e.target.value as PrivacyCase['status'])}>
                {['IN_REVIEW','WAITING','COMPLETED','REJECTED','CANCELLED'].map(v=><option key={v}>{v}</option>)}
              </SelectField>
              <FormField label="Decision/status note" multiline value={statusNote} onChange={e=>setStatusNote(e.target.value)} maxLength={1000}/>
              <ActionBar feedback={success}><PrimaryButton type="submit" loading={busy}>Update status</PrimaryButton></ActionBar>
            </form>

            <form onSubmit={updateHold} style={formCard}><h3>{selected.legalHold?'Release retention hold':'Add retention hold'}</h3>
              {!selected.legalHold&&<FormField label="Retention reason" multiline value={holdReason} onChange={e=>setHoldReason(e.target.value)} required minLength={3} maxLength={1000}/>}
              <ActionBar feedback={success}><SecondaryButton type="submit" loading={busy}>{selected.legalHold?'Release hold':'Add hold'}</SecondaryButton></ActionBar>
            </form>

            {selected.requestType==='ERASURE'&&<form onSubmit={updateRetention} style={formCard}><h3>Retention review</h3>
              <SelectField label="Decision" value={retentionDecision} onChange={e=>setRetentionDecision(e.target.value as 'ALLOW'|'BLOCK')}><option>BLOCK</option><option>ALLOW</option></SelectField>
              <FormField label="Retention decision reason" multiline value={retentionReason} onChange={e=>setRetentionReason(e.target.value)} required minLength={3} maxLength={1000}/>
              <ActionBar feedback={success}><SecondaryButton type="submit" loading={busy}>Record retention review</SecondaryButton></ActionBar>
            </form>}
          </div>}

          {selected.requestType==='ERASURE'&&<section style={formCard} aria-labelledby="platform-erasure-plan"><h3 id="platform-erasure-plan">Erasure/minimisation plan</h3>
            <ActionBar feedback={success}><SecondaryButton loading={busy} onClick={()=>void previewPlan()}>Preview plan</SecondaryButton></ActionBar>
            {plan?<><EvidenceGrid items={[
              {id:'executable',label:'Executable',value:plan.executable?'YES':'NO'},
              {id:'blockers',label:'Blockers',value:plan.blockers.length?plan.blockers.join(', '):'None'},
              {id:'erase',label:'Erase/minimise',value:plan.erase.length?plan.erase.join(', '):'None'},
              {id:'retain',label:'Retain',value:plan.retain.length?plan.retain.join(', '):'None'},
            ]}/>
            <label style={confirmRow}><input type="checkbox" checked={erasureConfirmed} onChange={e=>setErasureConfirmed(e.target.checked)}/><span>I confirm I reviewed the server-authoritative plan and understand removed runtime identifiers cannot be restored.</span></label>
            <ActionBar feedback={success}><DangerButton loading={busy} disabled={!plan.executable||!erasureConfirmed||selected.retentionDecision!=='ALLOW'||selected.legalHold} onClick={executeErasure}>Execute erasure</DangerButton></ActionBar>
            </>:<EmptyState title="Preview required" description="Preview the server-authoritative plan before executing erasure."/>}
          </section>}

          <section style={boundary}><strong>Control boundary</strong><p>Erasure execution is blocked while a legal hold, unresolved retention review or active account relationship exists. The executor revokes runtime identity data and anonymises the canonical account only for eligible platform-wide cases while retaining auditable finance/security evidence.</p></section>
        </>}
      </section>
    </div>}
  </PageShell>
}

const layout:React.CSSProperties={display:'grid',gridTemplateColumns:'minmax(0,.8fr) minmax(0,1.5fr)',gap:24,alignItems:'start'}
const listCard:React.CSSProperties={display:'grid',gap:8,padding:16,border:'1px solid var(--line, #d5e8eb)',borderRadius:16,background:'var(--surface, #fff)'}
const detailCard:React.CSSProperties={display:'grid',gap:16,padding:20,border:'1px solid var(--line, #d5e8eb)',borderRadius:16,background:'var(--surface, #fff)',minWidth:0}
const caseButton:React.CSSProperties={display:'grid',gap:6,width:'100%',textAlign:'left',padding:12,border:'1px solid var(--line, #d5e8eb)',borderRadius:12,background:'var(--surface, #fff)',color:'var(--ink, #17323a)',font:'inherit',cursor:'pointer'}
const selectedStyle:React.CSSProperties={background:'var(--neutral-soft, #eef6f7)',borderColor:'var(--brand, #05879a)',boxShadow:'inset 3px 0 0 var(--brand, #05879a)'}
const rowStyle:React.CSSProperties={display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',justifyContent:'space-between'}
const forms:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,240px),1fr))',gap:16}
const formCard:React.CSSProperties={display:'grid',gap:12,padding:16,border:'1px solid var(--line, #d5e8eb)',borderRadius:12,background:'var(--neutral-soft, #eef6f7)'}
const confirmRow:React.CSSProperties={display:'grid',gridTemplateColumns:'auto 1fr',gap:10,alignItems:'start'}
const boundary:React.CSSProperties={padding:16,borderRadius:12,background:'var(--neutral-soft, #eef6f7)'}
