'use client'

import { useEffect, useMemo, useState } from 'react'
import { EmptyState, ErrorState, PageHeader, PageShell, ReadinessPanel, StatusPill } from '../../components/admin-ui'
import { adminApi, getAdminSession, type AdminSession } from '../../lib/aaraagate-api'

type CurrentEntitlements={enabledFeatures?:string[]}
type Card={href:string;title:string;description:string}
type AttentionCard={
  id:string
  domain:string
  severity:'LOW'|'MEDIUM'|'HIGH'
  title:string
  summary:string
  prompt:string
  sources:string[]
  metrics:Record<string,number|string|null>
}
type ActionCentre={cards:AttentionCard[];generatedAt?:string;grounded:boolean;mutationPerformed:boolean}
const emergencyRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER','SECURITY_SUPERVISOR'])
const privacyRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN'])
const domainHref:Record<string,string>={
  FINANCE:'/finance',
  HELPDESK:'/helpdesk',
  SECURITY:'/emergency-operations',
  GATE:'/emergency-operations',
  FACILITIES:'/facilities/health',
  GOVERNANCE:'/governance',
  VENDOR:'/society-vendors',
  VENDORS:'/society-vendors',
  PROCUREMENT:'/society-vendors',
}
const severityTone=(severity:AttentionCard['severity'])=>severity==='HIGH'?'danger':severity==='MEDIUM'?'warning':'info'

export default function OperationsControlPage(){
 const[session,setSession]=useState<AdminSession|null>(null),[features,setFeatures]=useState<Set<string>>(new Set()),[centre,setCentre]=useState<ActionCentre|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('')
 useEffect(()=>{let active=true;const load=async()=>{setLoading(true);setError('');try{const current=getAdminSession();if(!current)return;if(!active)return;setSession(current);const entitlementPromise=adminApi<CurrentEntitlements>(current,'/entitlements/current');const centrePromise=adminApi<ActionCentre>(current,'/ai-operations/assistant/action-centre');const[entitlements,attention]=await Promise.allSettled([entitlementPromise,centrePromise]);if(!active)return;if(entitlements.status==='fulfilled')setFeatures(new Set(entitlements.value.enabledFeatures??[]));if(attention.status==='fulfilled')setCentre(attention.value);else setError(attention.reason instanceof Error?attention.reason.message:'Operational attention could not be loaded')}catch(e){if(active)setError(e instanceof Error?e.message:'Operations control could not be loaded')}finally{if(active)setLoading(false)}};void load();return()=>{active=false}},[])
 const role=session?.role??''
 const cards=useMemo(()=>{const items:Card[]=[];if(emergencyRoles.has(role)&&features.has('SOS'))items.push({href:'/emergency-operations',title:'Emergency control',description:'Acknowledge, coordinate and resolve SOS incidents.'});if(privacyRoles.has(role))items.push({href:'/privacy-operations',title:'Privacy operations',description:'Handle privacy requests and operational controls.'});if(role==='AUDITOR')items.push({href:'/audit',title:'Audit workspace',description:'Review read-only operational and financial evidence.'});if(role==='SUPER_ADMIN')items.push({href:'/platform',title:'Platform administration',description:'Manage cross-society platform configuration and operations.'});return items},[features,role])
 const attention=centre?.cards??[]
 const blockers=attention.filter(item=>item.severity==='HIGH').map(item=>`${item.domain}: ${item.title}`)
 return <PageShell>
  <PageHeader
    context={`${session?.societyName??'Current society'}${role?` · ${role.replaceAll('_',' ')}`:''}`}
    title="Operations Command Centre"
    description="One read-only attention surface across authorized domains. Every action remains in the owning workflow; this page never mutates finance, gate, helpdesk, facilities, governance, privacy or integration state."
    actions={<><a href="/ai-assistant">Open Assistant</a><a href="/">Admin home</a></>}
  />
  {error&&<ErrorState title="Some operational attention is unavailable" description={error}/>}
  <ReadinessPanel
    title="Society operational attention"
    state={loading?'loading':'ready'}
    status={{label:attention.length===0?'CLEAR':`${attention.length} ITEMS`,tone:attention.some(item=>item.severity==='HIGH')?'danger':attention.length?'warning':'success'}}
    blockers={blockers}
    nextActions={attention.slice(0,4).map(item=>item.summary)}
    boundary="Attention is descriptive and permission-scoped. Domain services, authorization, maker-checker controls and audit trails remain authoritative."
  />
  <section aria-labelledby="attention-heading" style={panel}>
    <div style={sectionHeader}><div><h2 id="attention-heading" style={{margin:'0 0 4px'}}>Needs attention now</h2><small>{centre?.generatedAt?`Updated ${new Date(centre.generatedAt).toLocaleString('en-IN')}`:'Read-only authoritative signals'}</small></div><StatusPill label={centre?.grounded===false?'UNVERIFIED':'GROUNDED'} tone={centre?.grounded===false?'warning':'success'}/></div>
    {loading?<p>Loading operational attention…</p>:attention.length===0?<EmptyState title="No role-visible operational exceptions need attention" description="Use the domain workspaces below for routine operations."/>:<div style={attentionGrid}>{attention.map(item=><a key={item.id} href={domainHref[item.domain]??'/ai-assistant'} style={attentionCard}><div style={attentionTop}><StatusPill label={item.severity} tone={severityTone(item.severity)}/><small>{item.domain}</small></div><strong>{item.title}</strong><span>{item.summary}</span><small>Sources: {item.sources.join(', ')||'authoritative domain records'}</small><span style={deepLink}>Open owning workflow →</span></a>)}</div>}
  </section>
  <section aria-labelledby="control-heading" style={panel}>
    <h2 id="control-heading" style={{marginTop:0}}>Control workspaces</h2>
    <p>Direct access remains role- and entitlement-aware. Opening a workspace does not broaden server permissions.</p>
    <div className="ops-control-grid">{cards.map(card=><a className="ops-control-card" href={card.href} key={card.href}><strong>{card.title}</strong><span>{card.description}</span></a>)}{role&&cards.length===0&&<EmptyState title="No additional control workspaces are assigned to this role."/>}</div>
  </section>
 </PageShell>
}
const panel:React.CSSProperties={padding:20,border:'1px solid #d5e8eb',borderRadius:18,background:'#fff',display:'grid',gap:16}
const sectionHeader:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}
const attentionGrid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:12}
const attentionCard:React.CSSProperties={display:'grid',gap:8,padding:16,border:'1px solid #d5e8eb',borderRadius:14,textDecoration:'none',color:'inherit',background:'#fbfefe'}
const attentionTop:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}
const deepLink:React.CSSProperties={fontWeight:700,color:'#05879a'}
