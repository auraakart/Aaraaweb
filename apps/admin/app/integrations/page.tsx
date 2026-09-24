'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { ActionBar, DetailPanel, EmptyState, ErrorState, FormField, PageHeader, PageShell, PrimaryButton, ReadinessPanel, SecondaryButton, StatusPill, Timeline } from '../../components/admin-ui'
import { api, type Session } from '../../lib/admin-client'

type Family='OTP'|'WHATSAPP'|'PUSH'|'PAYMENT_GATEWAY'|'ACCESS_CONTROL'|'OBJECT_STORAGE'|'SMART_METER'|'ACCOUNTING_CONNECTOR'
type Capability={family:Family;provider:string;configurationScope:'DEPLOYMENT'|'SOCIETY';configured:boolean;health:'READY'|'DEGRADED'|'UNCONFIGURED';capabilities:string[];boundary:string;contractVersion:string;retryDisposition:string;retryOwner:string;degradationMode:string}
type Configuration={societyId:string;family:Family;providerKey:string;enabled:boolean;updatedByUserId:string;createdAt:string;updatedAt:string}
type Conformance={family:Family;provider:string;health:Capability['health'];checks:Record<string,boolean>;missing:string[];status:'CONTRACT_READY'|'CONFIGURATION_REQUIRED'|'FIELD_EVIDENCE_REQUIRED'|'CONTRACT_GAP';certificationClaim:false;configurationReady:boolean;contractReady:boolean;fieldEvidenceRequired:boolean;productionActivationApproved:boolean;boundary:string}
type ConfigurationEvent={id:string;family:Family;eventType:string;providerKey:string;enabled:boolean;actorUserId:string;occurredAt:string}

const readRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER','AUDITOR'])
const manageRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN'])
function currentSession():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw) as Session:null}catch{return null}}
function tone(health:Capability['health']){return health==='READY'?'success':health==='DEGRADED'?'warning':'neutral'} 

export default function IntegrationReadinessPage(){
  const[s,setS]=useState<Session|null>(null),[registry,setRegistry]=useState<Capability[]>([]),[config,setConfig]=useState<Configuration[]>([]),[events,setEvents]=useState<ConfigurationEvent[]>([]),[conformance,setConformance]=useState<Conformance[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[feedback,setFeedback]=useState('')
  const[family,setFamily]=useState<Family>('OTP'),[providerKey,setProviderKey]=useState(''),[enabled,setEnabled]=useState(true)
  const canRead=!!s&&readRoles.has(s.role),canManage=!!s&&manageRoles.has(s.role)
  const selected=useMemo(()=>config.find(item=>item.family===family),[config,family])

  const load=useCallback(async(session:Session)=>{
    setLoading(true);setError('')
    try{const[r,c,e,cf]=await Promise.all([api<Capability[]>('/integrations/registry',{},session),api<Configuration[]>('/integrations/registry/configuration',{},session),api<ConfigurationEvent[]>('/integrations/registry/configuration/events',{},session),api<Conformance[]>('/integrations/registry/conformance',{},session)]);setRegistry(r);setConfig(c);setEvents(e);setConformance(cf)}
    catch(err){setError(err instanceof Error?err.message:'Integration readiness could not be loaded')}
    finally{setLoading(false)}
  },[])

  useEffect(()=>{const session=currentSession();setS(session);if(!session){setError('Sign in to the Admin console first.');setLoading(false);return}if(!readRoles.has(session.role)){setError('Your role does not have society configuration read access.');setLoading(false);return}void load(session)},[load])
  useEffect(()=>{setProviderKey(selected?.providerKey??registry.find(item=>item.family===family)?.provider??'');setEnabled(selected?.enabled??true)},[family,selected,registry])

  async function save(event:FormEvent){event.preventDefault();if(!s||!canManage)return;setBusy(true);setError('');setFeedback('');try{await api('/integrations/registry/configuration',{method:'PUT',body:JSON.stringify({family,providerKey,enabled})},s);setFeedback('Society integration selection saved with audit evidence.');await load(s)}catch(err){setError(err instanceof Error?err.message:'Integration configuration could not be saved')}finally{setBusy(false)}}

  if(!canRead&&!loading)return <PageShell><ErrorState title="Integration readiness unavailable" description={error}/></PageShell>

  const ready=registry.filter(item=>item.health==='READY').length
  const blockers=registry.filter(item=>item.health!=='READY').map(item=>`${item.family.replaceAll('_',' ')}: ${item.health.toLowerCase()}`)
  return <PageShell>
    <PageHeader title="Integration readiness" context={`${s?.societyName??'Current society'} · ${s?.role.replaceAll('_',' ')??''}`} description="Inspect versioned provider capabilities, society selections and audit history without exposing credentials or treating provider state as domain truth." actions={<SecondaryButton onClick={()=>s&&void load(s)} loading={loading}>Refresh</SecondaryButton>}/>
    {error&&<ErrorState title="Integration readiness needs attention" description={error}/>}
    <ReadinessPanel title="Provider ecosystem readiness" status={{label:`${ready}/${registry.length} ready`,tone:blockers.length?'warning':'success'}} blockers={blockers} nextActions={blockers.length?['Configure the affected boundary and obtain required external field evidence before production activation.']:[]} boundary="Repository readiness does not certify live credentials, commercial providers, physical devices or field operations." state={loading?'loading':'ready'} />
    <DetailPanel title="Adapter conformance" state={loading?'loading':conformance.length?'ready':'empty'} empty={<EmptyState title="No conformance evidence reported."/>}>
      <div style={{display:'grid',gap:12}}>{conformance.map(item=><article key={item.family} style={{border:'1px solid #e5e7eb',borderRadius:14,padding:14,display:'grid',gap:6}}><div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><strong>{item.family.replaceAll('_',' ')}</strong><StatusPill label={item.status.replaceAll('_',' ')} tone={item.status==='CONTRACT_READY'?'success':item.status==='CONTRACT_GAP'?'danger':'warning'}/></div><small>{Object.entries(item.checks).map(([key,value])=>`${key.replaceAll('_',' ')}: ${value?'yes':'no'}`).join(' · ')}</small><small>Configuration ready: {item.configurationReady?'yes':'no'} · Contract ready: {item.contractReady?'yes':'no'} · Field evidence required: {item.fieldEvidenceRequired?'yes':'no'} · Production activation approved: {item.productionActivationApproved?'yes':'no'}</small><small>{item.boundary}</small></article>)}</div>
    </DetailPanel>
    <DetailPanel title="Capability registry" state={loading?'loading':registry.length?'ready':'empty'} empty={<EmptyState title="No integration capabilities reported."/>}>
      <div style={{display:'grid',gap:12}}>{registry.map(item=><article key={item.family} style={{border:'1px solid #e5e7eb',borderRadius:14,padding:14,display:'grid',gap:7}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><strong>{item.family.replaceAll('_',' ')}</strong><StatusPill label={item.health} tone={tone(item.health)}/></div>
        <span>{item.provider} · {item.configurationScope.toLowerCase()} scope · {item.contractVersion}</span>
        <small>{item.capabilities.join(' · ')}</small><small>Retry: {item.retryDisposition.replaceAll('_',' ')} · owner {item.retryOwner}</small><small>{item.degradationMode}</small><small>{item.boundary}</small>
      </article>)}</div>
    </DetailPanel>
    {canManage&&<DetailPanel title="Society provider selection"><form onSubmit={save} style={{display:'grid',gap:14}}>
      <label>Integration family<select value={family} onChange={e=>setFamily(e.target.value as Family)} style={{display:'block',width:'100%',marginTop:6,padding:10,borderRadius:10,border:'1px solid #cbd5e1'}}>{registry.map(item=><option key={item.family} value={item.family}>{item.family.replaceAll('_',' ')}</option>)}</select></label>
      <FormField label="Provider key" value={providerKey} onChange={e=>setProviderKey(e.target.value)} maxLength={80} required hint="Provider identity only. Never paste API keys, tokens, credentials or private keys."/>
      <label style={{display:'flex',alignItems:'center',gap:8}}><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Enabled for this society</label>
      <ActionBar feedback={feedback}><PrimaryButton type="submit" loading={busy}>Save selection</PrimaryButton></ActionBar>
    </form></DetailPanel>}
    <DetailPanel title="Configuration audit history" state={loading?'loading':events.length?'ready':'empty'} empty={<EmptyState title="No provider selection changes recorded yet."/>}>
      <Timeline events={events.slice(0,50).map(item=>({id:item.id,label:`${item.family.replaceAll('_',' ')} · ${item.eventType.replaceAll('_',' ')}`,actor:item.actorUserId,timeLabel:new Date(item.occurredAt).toLocaleString('en-IN'),dateTime:item.occurredAt,evidence:<small>{item.providerKey} · {item.enabled?'enabled':'disabled'}</small>}))}/>
    </DetailPanel>
  </PageShell>
}
