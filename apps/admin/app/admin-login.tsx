'use client'

import { FormEvent, useState } from 'react'
import { adminRoles, viewsForRole } from '../lib/admin-access'
import { api, sessionFrom, type Membership, type Session } from '../lib/admin-client'
import {useLoginAttempt} from '../lib/use-login-attempt'

export function AdminLogin({onSession}:{onSession:(session:Session)=>void}){
  const[stage,setStage]=useState<'phone'|'otp'|'society'>('phone')
  const[phone,setPhone]=useState('+91')
  const[otp,setOtp]=useState('')
  const[challenge,setChallenge]=useState('')
  const[userId,setUserId]=useState('')
  const[token,setToken]=useState('')
  const[memberships,setMemberships]=useState<Membership[]>([])
  const{busy,error,run}=useLoginAttempt('aaraagate.admin.session')

  const send=(event:FormEvent)=>{
    event.preventDefault()
    void run(async current=>{
      const result=await api<{challengeId:string}>('/auth/otp/request',{
        method:'POST',
        body:JSON.stringify({phone:phone.trim()}),
      })
      if(!current())return
      if(typeof result?.challengeId!=='string'||!result.challengeId.trim())throw new Error('Unable to start verification')
      setChallenge(result.challengeId)
      setStage('otp')
    })
  }

  const verify=(event:FormEvent)=>{
    event.preventDefault()
    void run(async current=>{
      const result=await api<Record<string,unknown>>('/auth/otp/verify',{
        method:'POST',
        body:JSON.stringify({challengeId:challenge,code:otp}),
      })
      if(!current())return
      const options=((result.memberships as Membership[])??[])
        .filter((membership)=>adminRoles.has(membership.role)&&viewsForRole(membership.role).length>0)
      if(!options.length)throw new Error('No active Admin or operations-console membership')
      setUserId(String(result.userId))
      setMemberships(options)
      if(result.session&&options.length===1){onSession(sessionFrom(result,options[0]));return true}
      else{
        setToken(String(result.selectionToken??''))
        setStage('society')
      }
    })
  }

  const choose=(membership:Membership)=>void run(async current=>{
    const result=await api<Record<string,unknown>>('/auth/society/select',{
      method:'POST',
      body:JSON.stringify({
        userId,
        societyId:membership.societyId,
        selectionToken:token,
      }),
    })
    if(!current())return
    onSession(sessionFrom(result,membership));return true
  })

  return <main className="login"><section className="loginCard">
    <div className="brand">aaraagate</div>
    <h1>Admin & operations sign in</h1>
    <p>Secure society-scoped access based on your assigned capabilities.</p>
    {stage==='phone'&&<form onSubmit={send}><label>Mobile number<input disabled={busy} value={phone} onChange={e=>setPhone(e.target.value)} required/></label><button className="primary" disabled={busy}>Send OTP</button></form>}
    {stage==='otp'&&<form onSubmit={verify}><label>6-digit OTP<input disabled={busy} value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,'').slice(0,6))} minLength={6} maxLength={6} required/></label><button className="primary" disabled={busy||otp.length!==6}>Verify securely</button></form>}
    {stage==='society'&&<div className="choices">{memberships.map(membership=><button disabled={busy} key={`${membership.societyId}-${membership.role}`} onClick={()=>choose(membership)}><strong>{membership.society?.name??membership.society?.code??'Society'}</strong><span>{membership.role.replaceAll('_',' ')}</span></button>)}</div>}
    {busy&&<div className="progress"/>}
    {error&&<div className="error">{error}</div>}
  </section></main>
}
