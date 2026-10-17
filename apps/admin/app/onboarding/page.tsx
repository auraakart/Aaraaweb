'use client'

import {useCallback,useEffect,useRef,useState} from 'react'
import {api,type Session} from '../../lib/admin-client'
import {currentAdminSession,sameAdminContext} from '../../lib/admin-session-context'

type StepState='READY'|'IN_PROGRESS'|'REVIEW'
type OnboardingStep={
  id:string
  title:string
  description:string
  href:string
  state:StepState
  evidence:string
  blockers:string[]
  nextActions:string[]
}
type OnboardingPlan={
  status:'ACTION_REQUIRED'|'REPOSITORY_REVIEW_REQUIRED'
  repositoryReady:boolean
  readySteps:number
  totalSteps:number
  blockingStepIds:string[]
  activation:{eligibleResidents:number;activatedResidents:number;activationPercent:number|null}
  steps:OnboardingStep[]
  evaluatedAt:string
  productionizationClaim:false
  boundary:string
}

const allowed=(value:Session|null)=>!!value&&['SUPER_ADMIN','SOCIETY_ADMIN'].includes(value.role)

export default function SocietyOnboardingPage(){
  const[session,setSession]=useState<Session|null>(null)
  const[plan,setPlan]=useState<OnboardingPlan|null>(null)
  const[loading,setLoading]=useState(true)
  const[error,setError]=useState('')
  const epoch=useRef(0)
  const active=useRef<Session|null>(null)

  const syncSession=useCallback(()=>{
    const value=currentAdminSession()
    if(sameAdminContext(active.current,value))return
    epoch.current++
    active.current=value
    setPlan(null);setError('');setSession(value);setLoading(allowed(value))
  },[])

  const load=useCallback(async(value:Session)=>{
    if(!sameAdminContext(value,currentAdminSession())){syncSession();return}
    const request=++epoch.current
    setLoading(true);setError('');setPlan(null)
    const current=()=>request===epoch.current&&sameAdminContext(value,currentAdminSession())
    try{
      const result=await api<OnboardingPlan>('/onboarding/readiness',{},value)
      if(result.productionizationClaim!==false)throw new Error('Setup checks cannot establish production acceptance. Refresh or contact support.')
      if(current())setPlan(result)
    }catch(reason){if(current())setError(reason instanceof Error?reason.message:'Could not load onboarding readiness')}
    finally{
      if(request===epoch.current){
        if(current())setLoading(false)
        else syncSession()
      }
    }
  },[syncSession])

  useEffect(()=>{
    syncSession()
    window.addEventListener('storage',syncSession)
    window.addEventListener('focus',syncSession)
    return()=>{epoch.current++;window.removeEventListener('storage',syncSession);window.removeEventListener('focus',syncSession)}
  },[syncSession])
  useEffect(()=>{if(session&&allowed(session))void load(session)},[session,load])

  if(loading)return <main aria-busy="true" style={{padding:32}}><h1>Society onboarding</h1><p role="status">Loading setup checks…</p></main>
  if(!allowed(session))return <main style={{padding:32}}><h1>Society administration required</h1><a href="/">Return to Admin</a></main>

  const steps=plan?.steps??[]
  const progress=plan&&plan.totalSteps>0?plan.readySteps/plan.totalSteps*100:0

  return <main style={{maxWidth:1120,margin:'0 auto',padding:'28px 22px 80px'}}>
    <header style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap'}}>
      <div>
        <small>{session?.societyName??'Current society'}</small>
        <h1 style={{margin:'4px 0'}}>Society onboarding</h1>
        <p style={{margin:0}}>Review setup checks, resolve missing information and continue in the relevant workspace.</p>
      </div>
      <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
        <button disabled={loading} onClick={()=>session&&void load(session)} style={button}>Refresh</button>
        <a href="/">← Admin console</a>
      </div>
    </header>

    {error&&<div role="alert" style={errorBox}>{error}</div>}

    {plan&&<section style={panel}>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}>
        <div>
          <h2 style={{margin:'0 0 6px'}}>Setup progress</h2>
          <p style={{margin:0}}>{plan.repositoryReady?'Setup checks are ready for review. Pilot acceptance remains separate.':'Resolve the listed blockers before setup review.'}</p>
        </div>
        <div style={{display:'grid',gap:4,textAlign:'right'}}>
          <strong>{plan.readySteps}/{plan.totalSteps} setup checks ready</strong>
          <small>{plan?.status.replaceAll('_',' ')??'READINESS UNAVAILABLE'}</small>
          {plan&&<small>{plan.activation.activatedResidents}/{plan.activation.eligibleResidents} resident activation{plan.activation.activationPercent===null?'':` · ${plan.activation.activationPercent}%`}</small>}
        </div>
      </div>
      <div style={{height:8,background:'#e5e7eb',borderRadius:999,marginTop:14,overflow:'hidden'}}>
        <div style={{height:'100%',width:progress+'%',background:'#05879A'}}/>
      </div>
      {plan&&<small style={{display:'block',marginTop:10}}>Evaluated {new Date(plan.evaluatedAt).toLocaleString('en-IN')}</small>}
    </section>}

    <section style={{display:'grid',gap:12,marginTop:20}}>
      {steps.map(step=><article key={step.id} style={card}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start',flexWrap:'wrap'}}>
          <div style={{maxWidth:760}}>
            <h2 style={{margin:'0 0 6px',fontSize:18}}>{step.title}</h2>
            <p style={{margin:'0 0 8px'}}>{step.description}</p>
            <small>{step.evidence}</small>
          </div>
          <span style={pill(step.state)}>{step.state.replaceAll('_',' ')}</span>
        </div>
        {step.blockers.length>0&&<div style={attention}><b>Blockers</b><ul style={list}>{step.blockers.map(item=><li key={item}>{item.replaceAll('_',' ')}</li>)}</ul></div>}
        {step.nextActions.length>0&&<div><b>Next action</b><ul style={list}>{step.nextActions.map(item=><li key={item}>{item}</li>)}</ul></div>}
        <a href={step.href} style={action}>Open authoritative workspace →</a>
      </article>)}
    </section>

    <section style={panel}>
      <h2>Setup review</h2>
      <p style={{marginBottom:0}}>Setup checks do not establish field or production acceptance. Complete the required reviews before a society pilot.</p>
      {plan&&<details><summary>Review limitations</summary><p>{plan?.boundary}</p></details>}
    </section>
  </main>
}

const panel:React.CSSProperties={marginTop:20,padding:20,border:'1px solid #dbe7ea',borderRadius:16,background:'white'}
const card:React.CSSProperties={padding:18,border:'1px solid #dbe7ea',borderRadius:16,background:'white',display:'grid',gap:14}
const action:React.CSSProperties={fontWeight:700,textDecoration:'none',color:'#057689'}
const button:React.CSSProperties={padding:'9px 13px',borderRadius:10,border:'1px solid #cbd5e1',background:'white',fontWeight:700}
const errorBox:React.CSSProperties={marginTop:18,padding:12,border:'1px solid #ef4444',borderRadius:10}
const attention:React.CSSProperties={padding:12,border:'1px solid #fdba74',borderRadius:12,background:'#fff7ed'}
const list:React.CSSProperties={margin:'6px 0 0 18px',padding:0}
function pill(state:StepState):React.CSSProperties{return{padding:'6px 9px',borderRadius:999,fontSize:12,fontWeight:800,border:'1px solid #cbd5e1',background:state==='READY'?'#ecfdf5':state==='IN_PROGRESS'?'#fff7ed':'#eff6ff'}}
