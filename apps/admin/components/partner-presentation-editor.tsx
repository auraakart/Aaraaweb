'use client'
import {useEffect,useRef,useState,type FormEvent} from 'react'
import {api,type Session} from '../lib/admin-client'
import {partnerSessionKey,readPartnerSession} from '../lib/admin-partner'
import {operatorConfirm} from '../lib/operator-dialog'
type Revision={id:string;version:number;publishedAt:string|null;publishedById?:string|null;reason?:string|null}
export function PartnerPresentationEditor({session,partnerId,canEdit,onSaved}:{session:Session;partnerId:string;canEdit:boolean;onSaved:()=>void}){
 const [revisions,setRevisions]=useState<Revision[]>([]),[latest,setLatest]=useState(0),[published,setPublished]=useState(0),[name,setName]=useState(''),[primary,setPrimary]=useState('#0EABBE'),[deep,setDeep]=useState('#05879A'),[email,setEmail]=useState(''),[phone,setPhone]=useState(''),[reason,setReason]=useState(''),[overrides,setOverrides]=useState(['displayName','colors','support','logoAssetId']),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const live=useRef(true),identity=partnerSessionKey(session)
 const current=()=>live.current&&identity===partnerSessionKey(readPartnerSession())
 useEffect(()=>{live.current=true;void api<{revisions:Revision[];latestVersion:number;published:Revision|null}>('/partners/'+partnerId+'/branding',{cache:'no-store'},session).then(v=>{if(current()){if(!Array.isArray(v.revisions)||v.revisions.length>50||!Number.isSafeInteger(v.latestVersion))throw Error('Invalid brand history');setRevisions(v.revisions);setLatest(v.latestVersion);setPublished(v.published?.version??0)}}).catch(e=>{if(current())setError(e instanceof Error?e.message:'Brand history unavailable')});return()=>{live.current=false}},[session,partnerId]) // parent remounts on session/partner changes
 const save=async(e:FormEvent)=>{
  e.preventDefault();if(!current()||busy||!canEdit)return
  setBusy(true);setError('')
  try{await api('/partners/'+partnerId+'/branding/drafts',{method:'POST',body:JSON.stringify({expectedVersion:latest,config:{presentation:{displayName:name,colors:{primary,primaryDeep:deep},...((email||phone)?{support:{...(email?{email}:{}),...(phone?{phone}:{})}}:{})},societyOverrideFields:overrides}})},session);if(current())onSaved()}
  catch(e){if(current())setError(e instanceof Error?e.message:'Unable to save brand draft')}
  finally{if(current())setBusy(false)}
 }
 const publish=async(item:Revision)=>{
  if(!current()||busy||reason.trim().length<3||!await operatorConfirm('Publish partner presentation revision '+item.version+' for opted-in licensed societies?')||!current())return
  setBusy(true);setError('')
  try{await api('/partners/'+partnerId+'/branding/drafts/'+item.id+'/publish',{method:'POST',body:JSON.stringify({expectedPublishedVersion:published,reason})},session);if(current())onSaved()}
  catch(e){if(current())setError(e instanceof Error?e.message:'Unable to publish brand')}
  finally{if(current())setBusy(false)}
 }
 return <section className="panel"><h2>Partner presentation</h2><p>Applies through current licensing and society opt-in. Appearance never changes roles, dues or legal issuer identity.</p>{error&&<p role="alert">{error}</p>}
  {canEdit&&<form onSubmit={e=>void save(e)}><label>Display name<input value={name} required maxLength={80} onChange={e=>setName(e.target.value)}/></label><label>Primary colour<input type="color" value={primary} onChange={e=>setPrimary(e.target.value)}/></label><label>Deep colour<input type="color" value={deep} onChange={e=>setDeep(e.target.value)}/></label><label>Support email<input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Support phone<input value={phone} onChange={e=>setPhone(e.target.value)}/></label>
   <fieldset><legend>Society fields allowed to override</legend>{['displayName','colors','support','logoAssetId'].map(field=><label key={field}><input type="checkbox" checked={overrides.includes(field)} onChange={e=>setOverrides(old=>e.target.checked?[...old,field]:old.filter(f=>f!==field))}/>{field==='logoAssetId'?'Society logo':field}</label>)}</fieldset><button disabled={busy}>Save immutable draft</button></form>}
  <label>Publication reason<input value={reason} minLength={3} maxLength={500} onChange={e=>setReason(e.target.value)}/></label>
  <ul>{revisions.map(v=><li key={v.id}>Revision {v.version} · {v.publishedAt?'Published':'Draft'}{v.reason&&' · '+v.reason}{canEdit&&!v.publishedAt&&v.version>published&&<button disabled={busy||reason.trim().length<3} onClick={()=>void publish(v)}>Publish revision {v.version}</button>}</li>)}</ul>
 </section>
}
