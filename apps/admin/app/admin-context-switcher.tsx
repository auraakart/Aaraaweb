'use client'

import { useEffect, useState } from 'react'
import { api, type Session } from '../lib/admin-client'

const adminRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER','ACCOUNTANT','AUDITOR','SECURITY_SUPERVISOR'])

type SocietyContext={societyId:string;role:string;roles:string[];society:{name:string;code:string}}
type ContextResponse={contexts?:SocietyContext[];memberships?:SocietyContext[]}
type SwitchResponse={societyId:string;role:string;roles?:string[];session:{sessionId:string;accessToken:string;refreshToken:string}}

export function AdminContextSwitcher(){
  const[session,setSession]=useState<Session|null>(null)
  const[contexts,setContexts]=useState<SocietyContext[]>([])
  const[busy,setBusy]=useState(false)
  const[error,setError]=useState('')

  useEffect(()=>{
    let active=true
    const load=async()=>{try{
      const raw=sessionStorage.getItem('aaraagate.admin.session')
      if(!raw)return
      const stored=JSON.parse(raw) as Session
      if(!stored.accessToken||!stored.societyId)return
      if(active)setSession(stored)
      const body=await api<ContextResponse>('/auth/contexts',{},stored)
      const rows=(body.contexts??body.memberships??[]).filter(context=>context.roles.some(role=>adminRoles.has(role)))
      if(active)setContexts(rows)
    }catch{if(active)setContexts([])}}
    void load()
    return()=>{active=false}
  },[])

  if(!session||contexts.length<=1)return null

  const switchSociety=async(societyId:string)=>{
    if(societyId===session.societyId)return
    const context=contexts.find(item=>item.societyId===societyId)
    if(!context)return
    setBusy(true);setError('')
    try{
      const body=await api<SwitchResponse>('/auth/society/switch',{method:'POST',body:JSON.stringify({societyId})},session)
      if(!body?.session)throw new Error('Society context could not be switched')
      const uiRole=context.roles.find(role=>adminRoles.has(role))??body.role
      const next:Session={
        ...session,
        sessionId:body.session.sessionId,
        accessToken:body.session.accessToken,
        refreshToken:body.session.refreshToken,
        societyId,
        role:uiRole,
        societyName:context.society.name||context.society.code,
      }
      sessionStorage.setItem('aaraagate.admin.session',JSON.stringify(next))
      window.location.reload()
    }catch(e){setError(e instanceof Error?e.message:'Society context could not be switched');setBusy(false)}
  }

  return <div aria-label="Admin society context" style={{position:'fixed',right:24,top:18,zIndex:30,minWidth:240,padding:10,borderRadius:12,background:'white',border:'1px solid #dbe7ea',boxShadow:'0 8px 24px rgba(0,0,0,.12)'}}>
    <label style={{display:'grid',gap:4,fontSize:12,fontWeight:700,color:'#475569'}}>Current society
      <select aria-label="Switch society" value={session.societyId} disabled={busy} onChange={e=>void switchSociety(e.target.value)} style={{padding:'8px 10px',border:'1px solid #cbd5e1',borderRadius:9,background:'white',font:'inherit',fontWeight:700}}>
        {contexts.map(context=><option key={context.societyId} value={context.societyId}>{context.society.name||context.society.code}</option>)}
      </select>
    </label>
    {error&&<div role="alert" style={{marginTop:6,fontSize:12,color:'#b91c1c'}}>{error}</div>}
  </div>
}
