'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type Session={accessToken:string;role:string;societyId:string;societyName?:string}
type Building={id:string}
type MigrationBatch={id:string;entityType:string;status:string}
type RoleRow={id:string;role:string}
type Entitlements={enabledFeatures?:string[]}
type IntegrationConfiguration={family:string;providerKey:string;enabled:boolean}

type Step={
  id:string
  title:string
  description:string
  href:string
  state:'READY'|'IN_PROGRESS'|'REVIEW'
  evidence:string
}

const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
const requiredMigrationEntities=['BUILDING','UNIT','RESIDENT','VEHICLE','PARKING','WORKFORCE','VENDOR','OPENING_BALANCE']

function getSession():Session|null{
  try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw) as Session:null}catch{return null}
}

async function api<T>(session:Session,path:string):Promise<T>{
  const response=await fetch(base+'/api/v1'+path,{headers:{Accept:'application/json',Authorization:'Bearer '+session.accessToken}})
  const text=await response.text()
  const body=text?JSON.parse(text):null
  if(!response.ok)throw new Error(Array.isArray(body?.message)?body.message.join(', '):body?.message??('Request failed ('+response.status+')'))
  return body as T
}

export default function SocietyOnboardingPage(){
  const[session,setSession]=useState<Session|null>(null)
  const[buildings,setBuildings]=useState<Building[]>([])
  const[batches,setBatches]=useState<MigrationBatch[]>([])
  const[roles,setRoles]=useState<RoleRow[]>([])
  const[features,setFeatures]=useState<Set<string>>(new Set())
  const[integrations,setIntegrations]=useState<IntegrationConfiguration[]>([])
  const[loading,setLoading]=useState(true)
  const[error,setError]=useState('')

  const allowed=(value:Session|null)=>!!value&&['SUPER_ADMIN','SOCIETY_ADMIN'].includes(value.role)

  const load=useCallback(async(value:Session)=>{
    setLoading(true);setError('')
    try{
      const[buildingRows,batchRows,roleRows,entitlementRows,integrationRows]=await Promise.all([
        api<Building[]>(value,'/societies/'+value.societyId+'/buildings'),
        api<MigrationBatch[]>(value,'/migration/batches'),
        api<RoleRow[]>(value,'/society-roles'),
        api<Entitlements>(value,'/entitlements/current'),
        api<IntegrationConfiguration[]>(value,'/integrations/registry/configuration'),
      ])
      setBuildings(buildingRows)
      setBatches(batchRows)
      setRoles(roleRows)
      setFeatures(new Set(entitlementRows.enabledFeatures??[]))
      setIntegrations(integrationRows)
    }catch(reason){setError(reason instanceof Error?reason.message:'Could not load onboarding readiness')}
    finally{setLoading(false)}
  },[])

  useEffect(()=>{const value=getSession();setSession(value);if(value&&allowed(value))void load(value);else setLoading(false)},[load])

  const migrationCoverage=useMemo(()=>new Set(batches.filter(row=>row.status==='COMMITTED').map(row=>row.entityType)),[batches])
  const migrationReady=requiredMigrationEntities.every(entity=>migrationCoverage.has(entity))
  const accessConfigured=integrations.some(row=>row.family==='ACCESS_CONTROL'&&row.enabled)
  const paymentConfigured=integrations.some(row=>row.family==='PAYMENT_GATEWAY'&&row.enabled)
  const operationalRoles=new Set(roles.map(row=>row.role))

  const steps=useMemo<Step[]>(()=>[
    {
      id:'property',
      title:'1. Property structure',
      description:'Create buildings, floors and units, or migrate them through the canonical import flow.',
      href:'/property',
      state:buildings.length>0?'READY':'IN_PROGRESS',
      evidence:buildings.length>0?buildings.length+' building/block record(s) available':'No building/block is configured yet',
    },
    {
      id:'migration',
      title:'2. Data migration',
      description:'Preview CSV/XLSX, resolve row errors, persist dry-run evidence and commit domain-safe batches.',
      href:'/migration',
      state:migrationReady?'READY':batches.length>0?'IN_PROGRESS':'REVIEW',
      evidence:migrationCoverage.size+'/'+requiredMigrationEntities.length+' canonical entity types committed',
    },
    {
      id:'roles',
      title:'3. People & operational roles',
      description:'Assign committee, facility, accounting, audit and security responsibilities without changing owner/tenant relationship authority.',
      href:'/roles',
      state:roles.length>0?'READY':'IN_PROGRESS',
      evidence:roles.length+' active operational assignment(s)',
    },
    {
      id:'gate',
      title:'4. Gate & access readiness',
      description:'Configure access-control provider identity and device operations through the existing integration/access workspaces.',
      href:'/integrations',
      state:accessConfigured?'READY':'REVIEW',
      evidence:accessConfigured?'Access-control integration enabled':'Review access-control provider configuration',
    },
    {
      id:'amenities',
      title:'5. Amenities',
      description:'Configure amenity inventory, booking rules, approval requirements and operational capacity in the authoritative amenities module.',
      href:'/amenities',
      state:features.has('AMENITIES')?'REVIEW':'IN_PROGRESS',
      evidence:features.has('AMENITIES')?'Amenities feature enabled; review society policy':'Amenities feature is not enabled for this society',
    },
    {
      id:'billing',
      title:'6. Billing & finance',
      description:'Review society accounting, tax, reconciliation and gateway readiness in the finance workspaces. Financial mutation remains permission-scoped.',
      href:'/finance',
      state:features.has('SOCIETY_ACCOUNTING')&&paymentConfigured?'REVIEW':'IN_PROGRESS',
      evidence:features.has('SOCIETY_ACCOUNTING')?(paymentConfigured?'Accounting and payment-gateway capabilities available':'Accounting enabled; payment gateway configuration needs review'):'Society accounting feature is not enabled',
    },
    {
      id:'policy',
      title:'7. Governance & society policy',
      description:'Review committee, quorum, approval, bye-law references and governance evidence in the existing governance module.',
      href:'/governance',
      state:features.has('GOVERNANCE')?'REVIEW':'IN_PROGRESS',
      evidence:features.has('GOVERNANCE')?'Governance feature enabled; society-specific policy acceptance remains separate':'Governance feature availability requires review',
    },
    {
      id:'final',
      title:'8. Readiness review',
      description:'Confirm migration evidence, role coverage and integration configuration before pilot acceptance.',
      href:'/migration',
      state:buildings.length>0&&roles.length>0&&batches.length>0?'REVIEW':'IN_PROGRESS',
      evidence:'Repository readiness is not a substitute for hosted, provider, device or human acceptance evidence',
    },
  ],[accessConfigured,batches.length,buildings.length,features,migrationCoverage.size,migrationReady,paymentConfigured,roles.length])

  if(loading)return <main style={{padding:32}}>Loading society onboarding readiness…</main>
  if(!allowed(session))return <main style={{padding:32}}><h1>Society administration required</h1><a href="/">Return to Admin</a></main>

  const readyCount=steps.filter(step=>step.state==='READY').length
  return <main style={{maxWidth:1120,margin:'0 auto',padding:'28px 22px 80px'}}>
    <header style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap'}}>
      <div><small>{session?.societyName??'Current society'}</small><h1 style={{margin:'4px 0'}}>Society onboarding</h1><p style={{margin:0}}>One guided path across existing authoritative setup modules. No duplicate configuration store is introduced.</p></div>
      <a href="/">← Admin console</a>
    </header>
    {error&&<div style={errorBox}>{error}</div>}
    <section style={panel}>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}>
        <div><h2 style={{margin:'0 0 6px'}}>Readiness overview</h2><p style={{margin:0}}>Complete repository setup first, then retain external pilot/provider/device acceptance separately.</p></div>
        <strong>{readyCount}/{steps.length} steps repository-ready</strong>
      </div>
      <div style={{height:8,background:'#e5e7eb',borderRadius:999,marginTop:14,overflow:'hidden'}}><div style={{height:'100%',width:(readyCount/steps.length*100)+'%',background:'#05879A'}}/></div>
    </section>
    <section style={{display:'grid',gap:12,marginTop:20}}>
      {steps.map(step=><article key={step.id} style={card}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start',flexWrap:'wrap'}}>
          <div style={{maxWidth:760}}><h2 style={{margin:'0 0 6px',fontSize:18}}>{step.title}</h2><p style={{margin:'0 0 8px'}}>{step.description}</p><small>{step.evidence}</small></div>
          <span style={pill(step.state)}>{step.state.replaceAll('_',' ')}</span>
        </div>
        <a href={step.href} style={action}>Open authoritative workspace →</a>
      </article>)}
    </section>
    <section style={panel}>
      <h2>Authority boundaries</h2>
      <p style={{marginBottom:0}}>Owner/tenant relationships remain occupancy-driven, finance remains permission-separated, provider secrets stay in deployment configuration, and this onboarding workspace only coordinates existing domain surfaces. Hosted production, physical hardware, live provider credentials and real-society policy acceptance remain external gates.</p>
    </section>
  </main>
}

const panel:React.CSSProperties={marginTop:20,padding:20,border:'1px solid #dbe7ea',borderRadius:16,background:'white'}
const card:React.CSSProperties={padding:18,border:'1px solid #dbe7ea',borderRadius:16,background:'white',display:'grid',gap:14}
const action:React.CSSProperties={fontWeight:700,textDecoration:'none',color:'#057689'}
const errorBox:React.CSSProperties={marginTop:18,padding:12,border:'1px solid #ef4444',borderRadius:10}
function pill(state:Step['state']):React.CSSProperties{return{padding:'6px 9px',borderRadius:999,fontSize:12,fontWeight:800,border:'1px solid #cbd5e1',background:state==='READY'?'#ecfdf5':state==='IN_PROGRESS'?'#fff7ed':'#eff6ff'}}
