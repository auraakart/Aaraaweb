'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DetailPanel, EmptyState, ErrorState, FormField, PageHeader, PageShell, PrimaryButton, QueuePanel, ReadinessPanel, SecondaryButton, StatusPill } from '../../components/admin-ui'
import { api, type Session } from '../../lib/admin-client'
import { operatorConfirm } from '../../lib/operator-dialog'
import { licensingRequestKey, licensingSessionKey, parseDomainPreview, parseLicensingOverview, readLicensingSession, type LicenseView, type LicensingOverview } from '../../lib/admin-licensing'

export default function LicensingPage(){
 const [session,setSession]=useState<Session|null>(null),[overview,setOverview]=useState<LicensingOverview|null>(null),[selectedId,setSelectedId]=useState('')
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState(''),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false)
 const [hostname,setHostname]=useState(''),[preview,setPreview]=useState('')
 const generation=useRef(0),abort=useRef<AbortController|null>(null),requests=useRef(new Map<string,Record<string,unknown>>()),sessionIdentity=useRef('')
 const selected=overview?.licenses.find(l=>l.grantId===selectedId)??null
 const platform=session?.role==='SUPER_ADMIN'
 const load=useCallback(async(s:Session)=>{
  const run=++generation.current,key=licensingSessionKey(s);abort.current?.abort();const controller=new AbortController();abort.current=controller
  setLoading(true);setError('');setOverview(null);setPreview('')
  try{const value=await api<unknown>(`/licensing/societies/${s.societyId}/overview`,{signal:controller.signal,cache:'no-store'},s)
   if(run!==generation.current||key!==licensingSessionKey(readLicensingSession()))return
   const next=parseLicensingOverview(value,s.societyId);setOverview(next);setSelectedId(old=>next.licenses.some(l=>l.grantId===old)?old:next.licenses[0]?.grantId??'')
  }catch(e){if(run===generation.current&&!controller.signal.aborted)setError(e instanceof Error?e.message:'Licensing could not be loaded')}
  finally{if(run===generation.current)setLoading(false)}
 },[])
 useEffect(()=>{
  const sync=()=>{const next=readLicensingSession(),identity=licensingSessionKey(next);if(identity!==sessionIdentity.current){requests.current.clear();sessionIdentity.current=identity;setBusy(false);setSuccess('');setError('')}setSession(next);setOverview(null);setPreview('');setConfirmed(false);if(next)void load(next);else{++generation.current;abort.current?.abort();setLoading(false)}}
  sync();window.addEventListener('focus',sync);window.addEventListener('storage',sync)
  return()=>{++generation.current;abort.current?.abort();window.removeEventListener('focus',sync);window.removeEventListener('storage',sync)}
 },[load])
 useEffect(()=>{setConfirmed(false);setReason('');setPreview('');setSuccess('')},[selectedId])
 const valid=()=>session&&licensingSessionKey(session)===licensingSessionKey(readLicensingSession())
 const mutate=async(action:'approve'|'revoke'|'opt-in'|'withdraw'|'activate',license:LicenseView)=>{
  if(!session||!overview||!valid()||busy)return
  if(action==='opt-in'&&!confirmed)return
  if((action==='approve'||action==='revoke')&&(!platform||reason.trim().length<3)){setError('Enter a reason of at least 3 characters.');return}
  const captured=licensingSessionKey(session),scope=overview,key=licensingRequestKey(session,scope,license,action)
  const message={approve:'Approve this partner plan with existing society features preserved?',revoke:'Revoke commercial licensing authority? Existing resident features and gate/SOS will remain available.',withdraw:'Withdraw this society’s license opt-in? Existing resident features will remain available.',activate:'Activate the approved license allocation for this society?', 'opt-in':'Confirm this society’s opt-in with its current features preserved.'}[action]
  if(!await operatorConfirm(message)||captured!==licensingSessionKey(readLicensingSession()))return
  let body=requests.current.get(key)
  if(!body){body={grantId:license.grantId,expectedGrantVersion:license.grantVersion,expectedOwnershipVersion:scope.society.ownershipVersion,idempotencyKey:crypto.randomUUID()}
   if(action==='approve')Object.assign(body,{reason:reason.trim(),essentialPolicy:'PRESERVE_LEGACY'})
   if(action==='revoke')Object.assign(body,{reason:reason.trim()})
   if(action==='opt-in'||action==='withdraw')Object.assign(body,{decision:action==='opt-in'?'OPT_IN':'WITHDRAW',expectedFeatures:scope.society.enabledFeatures})
   if(action==='activate')Object.assign(body,{consentId:license.consent?.id})
   requests.current.set(key,body)
  }
  const path={approve:'approvals',revoke:'revocations','opt-in':'consents',withdraw:'consents',activate:'allocations'}[action]
  setBusy(true);setError('');setSuccess('')
  try{await api(`/licensing/societies/${session.societyId}/${path}`,{method:'POST',body:JSON.stringify(body)},session)
   if(captured!==licensingSessionKey(readLicensingSession()))return
   requests.current.clear();setConfirmed(false);setSuccess('Licensing decision recorded.');await load(session)
  }catch(e){if(captured===licensingSessionKey(readLicensingSession()))setError(`${e instanceof Error?e.message:'Licensing update failed'}. Refresh if the plan or society changed. Retry repeats the original decision safely.`)}
  finally{if(captured===licensingSessionKey(readLicensingSession()))setBusy(false)}
 }
 const inspectDomain=async()=>{
  if(!session||!overview||!valid()||busy)return
  const key=licensingSessionKey(session),scope=overview;setBusy(true);setPreview('');setError('')
  try{const value=await api<unknown>(`/licensing/societies/${session.societyId}/domain-preview?hostname=${encodeURIComponent(hostname.trim())}`,{cache:'no-store'},session)
   if(key===licensingSessionKey(readLicensingSession()))setPreview(parseDomainPreview(value,scope).hostname)
  }catch(e){if(key===licensingSessionKey(readLicensingSession()))setError(e instanceof Error?e.message:'Test domain preview unavailable')}
  finally{if(key===licensingSessionKey(readLicensingSession()))setBusy(false)}
 }
 if(!loading&&!session)return <PageShell><PageHeader title="Licensing access required" description="Sign in as the selected society’s administrator or platform operator." actions={<a href="/">Return to Admin</a>}/></PageShell>
 return <PageShell><PageHeader title="Partner licensing" context={session?.societyName} description="Review commercial approval, society opt-in and license allocation." actions={<><a href="/">Admin console</a><SecondaryButton disabled={busy||loading||!session} onClick={()=>session&&valid()&&void load(session)}>Refresh</SecondaryButton></>}/>
  {error&&<ErrorState title="Licensing needs attention" description={error}/>}{success&&<p role="status">{success}</p>}
  <ReadinessPanel title="Resident continuity" status={{label:'Existing features preserved',tone:'info'}} boundary="Commercial expiry, withdrawal or revocation does not disable existing resident features or gate/SOS access."/>
  {loading?<p role="status">Loading licensing…</p>:overview?<><PageShell.Columns>
   <QueuePanel title="Partner plans" count={overview.licenses.length} state={overview.licenses.length?'ready':'empty'} empty={<EmptyState title="No license proposals yet" description="A platform operator creates a versioned plan and partner draft before independent approval."/>}>
    <p>{overview.partner.name} · {overview.partner.status}</p>{overview.licenses.map(l=><SecondaryButton key={l.grantId} disabled={busy} aria-pressed={selectedId===l.grantId} onClick={()=>setSelectedId(l.grantId)}>{l.planCode.replaceAll('_',' ')} · revision {l.planVersion} · {l.approvalState.toLowerCase()}</SecondaryButton>)}
    {overview.hasMore&&<p>Showing the current license and recent proposals.</p>}
   </QueuePanel>
   <DetailPanel title="Selected license" state={selected?'ready':'empty'}>{selected&&<>
    <h3>{selected.planCode.replaceAll('_',' ')}</h3><StatusPill label={selected.approvalState} tone={selected.approvalState==='REVOKED'?'warning':selected.approvalState==='APPROVED'?'success':'neutral'}/>{' '}<StatusPill label={selected.phase}/>
    <p>{new Date(selected.startsAt).toLocaleString('en-IN')} – {new Date(selected.endsAt).toLocaleString('en-IN')}</p>
    {platform&&selected.used!==null&&<p>Approved allocation capacity: {selected.used} of {selected.maximumSocieties} societies</p>}
    <p>Society opt-in: {selected.consent?.decision==='OPT_IN'?'Recorded':selected.consent?'Withdrawn':'Not recorded'} · Allocation: {selected.allocation?.active?'Active':selected.allocation?'Paused':'Not activated'}</p>
    {selected.consent?.decision==='OPT_IN'&&!selected.snapshotMatches&&<p>Society configuration changed. Withdraw the previous opt-in and review a new one before activation.</p>}
    <p>Current {overview.society.productTier.toLowerCase()} features: {overview.society.enabledFeatures.map(f=>f.replaceAll('_',' ').toLowerCase()).join(', ')}.</p>
    {platform&&(selected.capabilities.canApprove||selected.capabilities.canRevoke)&&<FormField label="Decision reason" value={reason} maxLength={500} disabled={busy} onChange={e=>setReason(e.target.value)}/>}
    {selected.capabilities.canOptIn&&<label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/> I confirm this society’s opt-in with its current features preserved.</label>}
    <div style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:16}}>
     {platform&&selected.capabilities.canApprove&&<PrimaryButton disabled={busy||reason.trim().length<3} onClick={()=>void mutate('approve',selected)}>Approve commercial license</PrimaryButton>}
     {selected.capabilities.canOptIn&&<PrimaryButton disabled={busy||!confirmed} onClick={()=>void mutate('opt-in',selected)}>Record society opt-in</PrimaryButton>}
     {platform&&selected.capabilities.canActivate&&<PrimaryButton disabled={busy} onClick={()=>void mutate('activate',selected)}>Activate society allocation</PrimaryButton>}
     {selected.capabilities.canWithdraw&&<SecondaryButton disabled={busy} onClick={()=>void mutate('withdraw',selected)}>Withdraw opt-in</SecondaryButton>}
     {platform&&selected.capabilities.canRevoke&&<SecondaryButton disabled={busy||reason.trim().length<3} onClick={()=>void mutate('revoke',selected)}>Revoke commercial license</SecondaryButton>}
    </div>
   </>}</DetailPanel>
  </PageShell.Columns>
  {overview.domainPreviewEnabled&&<DetailPanel title="Test domain inspection"><p>Inspect a configured test hostname for this society. This preview does not activate DNS, login routing or permissions.</p><FormField label="Test domain hostname" value={hostname} maxLength={253} disabled={busy} onChange={e=>{setHostname(e.target.value);setPreview('')}}/><SecondaryButton disabled={busy||!hostname.trim()} onClick={()=>void inspectDomain()}>Inspect test domain</SecondaryButton>{preview&&<p role="status">Configured test candidate: {preview}</p>}</DetailPanel>}
  </>:null}
 </PageShell>
}
