'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { ActionBar, DetailPanel, EmptyState, ErrorState, FormField, PageHeader, PageShell, PrimaryButton, ReadinessPanel, SecondaryButton, StatusPill, Timeline } from '../../components/admin-ui'

type Session={accessToken:string;role:string;societyName?:string}
type Family='OTP'|'WHATSAPP'|'PUSH'|'PAYMENT_GATEWAY'|'ACCESS_CONTROL'|'OBJECT_STORAGE'|'SMART_METER'|'ACCOUNTING_CONNECTOR'
type Capability={family:Family;provider:string;configurationScope:'DEPLOYMENT'|'SOCIETY';configured:boolean;health:'READY'|'DEGRADED'|'UNCONFIGURED';capabilities:string[];boundary:string;contractVersion:string;retryDisposition:string;retryOwner:string;degradationMode:string}
type Configuration={societyId:string;family:Family;providerKey:string;enabled:boolean;updatedByUserId:string;createdAt:string;updatedAt:string}
type ConfigurationEvent={id:string;family:Family;eventType:string;providerKey:string;enabled:boolean;actorUserId:string;occurredAt:string}

const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
const readRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER','AUDITOR'])
const manageRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN'])
function currentSession():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw) as Session:null}catch{return null}}
async function api<T>(s:Session,path:string,init:RequestInit={}):Promise<T>{const response=await fetch(`${base}/api/v1${path}`,{...init,headers:{Accept:'application/json','Content-Type':'application/json',Authorization:`Bearer ${s.accessToken}`,...init.headers}});const text=await response.text();const body=text?JSON.parse(text):null;if(!response.ok)throw new Error(Array.isArray(body?.message)?body.message.join(', '):body?.message??`Request failed (${response.status})`);return body as T}
function tone(health:Capability['health']){return health==='READY'?'success':health==='DEGRADED'?'warning':'neutral'} 

export default function IntegrationReadinessPage(){
  const[s,setS]=useState<Session|null>(null),[registry,setRegistry]=useState<Capability[]>([]),[config,setConfig]=useState<Configuration[]>([]),[events,setEvents]=useState<ConfigurationEvent[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[feedback,setFeedback]=useState('')
  const[family,setFamily]=useState<Family>('OTP'),[providerKey,setProviderKey]=useState(''),[enabled,setEnabled]=useState(true)
  const canRead=!!s&&readRoles.has(s.role),canManage=!!s&&manageRoles.has(s.role)
  const selected=useMemo(()=>config.find(item=>item.family===family),[config,family])

  const load=useCallback(async(session:Session)=>{
    setLoading(true);setError('')
    try{const[r,c,e]=await Promise.all([api<Capability[]>(session,'/integrations/registry'),api<Configuration[]>(session,'/integrations/registry/configuration'),api<ConfigurationEvent[]>(session,'/integrations/registry/configuration/events')]);setRegistry(r);setConfig(c);setEvents(e)}
    catch(err){setError(err instanceof Error?err.message:'Integration readiness could not be loaded')}
    finally{setLoading(false)}
  },[])

  useEffect(()=>{const session=currentSession();setS(session);if(!session){setError('Sign in to the Admin console first.');setLoading(false);return}if(!readRoles.has(session.role)){setError('Your role does not have society configuration read access.');setLoading(false);return}void load(session)},[load])
  useEffect(()=>{setProviderKey(selected?.providerKey??registry.find(item=>item.family===family)?.provider??'');setEnabled(selected?.enabled??true)},[family,selected,registry])

  async function save(event:FormEvent){event.preventDefault();if(!s||!canManage)return;setBusy(true);setError('');setFeedback('');try{await api(s,'/integrations/registry/configuration',{method:'PUT',body:JSON.stringify({family,providerKey,enabled})});setFeedback('Society integration selection saved with audit evidence.');await load(s)}catch(err){setError(err instanceof Error?err.message:'Integration configuration could not be saved')}finally{setBusy(false)}}

  if(!canRead&&!loading)return <PageShell><ErrorState title="Integration readiness unavailable" description={error}/></PageShell>

  const ready=registry.filter(item=>item.health==='READY').length
  const blockers=registry.filter(item=>item.health!=='READY').map(item=>`${item.family.replaceAll('_',' ')}: ${item.health.toLowerCase()}`)
  return <PageShell>
    <PageHeader title="Integration readiness" context={`${s?.societyName??'Current society'} · ${s?.role.replaceAll('_',' ')??''}`} description="Inspect versioned provider capabilities, society selections and audit history without exposing credentials or treating provider state as domain truth." actions={<SecondaryButton onClick={()=>s&&void load(s)} loading={loading}>Refresh</SecondaryButton>}/>
    {error&&<ErrorState title="Integration readiness needs attention" description={error}/>}
    <ReadinessPanel title="Provider ecosystem readiness" status={{label:`${ready}/${registry.length} ready`,tone:blockers.length?'warning':'success'}} blockers={blockers} nextActions={blockers.length?['Configure or certify the affected deployment/provider boundary before activation.']:[]} boundary="Repository readiness does not certify live credentials, commercial providers, physical devices or field operations." state={loading?'loading':'ready'} />
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
