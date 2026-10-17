'use client'
import { type FormEvent, useState } from 'react'
import { api } from '../../../lib/admin-client'
import { partnerSessionFrom, partnerStorageKey } from '../../../lib/admin-partner'
import {useLoginAttempt} from '../../../lib/use-login-attempt'

/** Partner OTP login never creates a society operations session. */
export default function PartnerLoginPage(){
 const [stage,setStage]=useState<'phone'|'otp'>('phone')
 const [phone,setPhone]=useState('+91'),[otp,setOtp]=useState(''),[challengeId,setChallengeId]=useState('')
 const {busy,error,run}=useLoginAttempt(partnerStorageKey)
 const send=async(event:FormEvent)=>{
  event.preventDefault();await run(async current=>{
   const reply=await api<{challengeId:string}>('/auth/otp/request',{method:'POST',body:JSON.stringify({phone:phone.trim()}),cache:'no-store'})
   if(!current())return
   if(typeof reply?.challengeId!=='string'||!reply.challengeId.trim())throw new Error('Unable to start verification')
   setChallengeId(reply.challengeId);setStage('otp')
  })
 }
 const verify=async(event:FormEvent)=>{
  event.preventDefault();await run(async current=>{
   const data=await api<unknown>('/auth/partner/otp/verify',{method:'POST',body:JSON.stringify({challengeId,code:otp}),cache:'no-store'})
   if(!current())return
   const session=partnerSessionFrom(data)
   // Separate from the society-admin slot; scoped to this browser origin.
   sessionStorage.setItem(partnerStorageKey,JSON.stringify(session))
   window.location.assign('/partners/members')
   return true
  })
 }
 return <main className="login"><section className="loginCard">
  <div className="brand">aaraagate</div>
  <h1>Partner sign in</h1>
  <p>Use your existing Aaraagate account. Partner access does not grant society operations or gate access.</p>
  {stage==='phone'?<form onSubmit={e=>void send(e)}>
   <label>Mobile number<input disabled={busy} autoComplete="tel" value={phone} required onChange={e=>setPhone(e.target.value)}/></label>
   <button className="primary" disabled={busy}>Send OTP</button>
  </form>:<form onSubmit={e=>void verify(e)}>
   <label>6-digit OTP<input disabled={busy} autoComplete="one-time-code" inputMode="numeric" value={otp} maxLength={6} minLength={6} required onChange={e=>setOtp(e.target.value.replace(/\D/g,'').slice(0,6))}/></label>
   <button className="primary" disabled={busy||otp.length!==6}>Access partner workspace</button>
   <button type="button" disabled={busy} onClick={()=>{setOtp('');setStage('phone')}}>Use another number</button>
  </form>}
  {error&&<div className="error" role="alert">{error}</div>}
  {busy&&<div className="progress" role="status">Verifying…</div>}
  <p><a href="/partners">Partner workspace</a> · <a href="/">Society admin console</a></p>
 </section></main>
}
