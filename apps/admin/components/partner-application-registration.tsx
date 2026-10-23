'use client'
import {useEffect,useRef,useState,type FormEvent} from 'react'
import {api,type Session} from '../lib/admin-client'
import {partnerSessionKey,readPartnerSession} from '../lib/admin-partner'
export function PartnerApplicationRegistration({session,partnerId,onSaved}:{session:Session;partnerId:string;onSaved:()=>void}){
 const [applicationId,setId]=useState(''),[appRole,setRole]=useState('RESIDENT'),[signerFingerprint,setSigner]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const live=useRef(true),identity=partnerSessionKey(session)
 useEffect(()=>{live.current=true;return()=>{live.current=false}},[])
 const current=()=>live.current&&identity===partnerSessionKey(readPartnerSession())
 const save=async(e:FormEvent)=>{e.preventDefault();if(busy||!current())return;setBusy(true);setError('');try{await api('/partners/'+partnerId+'/applications',{method:'POST',body:JSON.stringify({applicationId,appRole,signerFingerprint})},session);if(current())onSaved()}catch(e){if(current())setError(e instanceof Error?e.message:'Unable to reserve application')}finally{if(current())setBusy(false)}}
 return <section className="panel"><h2>Reserve a partner TEST app identity</h2><p>Package, role and signer are permanent. This creates no build or store release. Each society separately approves its scope in the licensing workspace.</p>{error&&<p role="alert">{error}</p>}<form onSubmit={e=>void save(e)}><label>Android package<input required maxLength={150} value={applicationId} onChange={e=>setId(e.target.value)}/></label><label>App role<select value={appRole} onChange={e=>setRole(e.target.value)}><option>RESIDENT</option><option>GUARD</option></select></label><label>TEST signer SHA-256<input required pattern="[a-f0-9]{64}" value={signerFingerprint} onChange={e=>setSigner(e.target.value)}/></label><button disabled={busy}>Reserve identity</button></form></section>
}
