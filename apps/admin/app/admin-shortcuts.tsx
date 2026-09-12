'use client'

import { useEffect, useState } from 'react'

const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
const reportRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER','ACCOUNTANT'])
const financeRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','ACCOUNTANT'])
const societySetupRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN'])
const occupancyRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER','COMMITTEE_MEMBER'])
const marketplaceRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER'])
const amenityRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER'])

type StoredSession={role?:string;accessToken?:string}
type CurrentEntitlements={enabledFeatures?:string[]}

export function AdminShortcuts(){
  const[role,setRole]=useState('')
  const[features,setFeatures]=useState<Set<string>>(new Set())
  useEffect(()=>{
    let active=true
    const load=async()=>{try{
      const raw=sessionStorage.getItem('aaraagate.admin.session');if(!raw)return
      const session=JSON.parse(raw) as StoredSession
      const nextRole=session.role??''
      if(!active)return
      setRole(nextRole)
      if(!session.accessToken)return
      const response=await fetch(`${base}/api/v1/entitlements/current`,{headers:{Accept:'application/json',Authorization:`Bearer ${session.accessToken}`}})
      if(!response.ok)return
      const body=await response.json() as CurrentEntitlements
      if(active)setFeatures(new Set(body.enabledFeatures??[]))
    }catch{if(active){setRole('');setFeatures(new Set())}}}
    void load()
    return()=>{active=false}
  },[])
  if(!role)return null
  const links:{href:string;label:string}[]=[]
  if(reportRoles.has(role)&&features.has('ADVANCED_REPORTS'))links.push({href:'/reports',label:'Reports'})
  if(financeRoles.has(role)&&features.has('SOCIETY_ACCOUNTING')){
    links.push({href:'/finance',label:'Finance'})
    links.push({href:'/finance/operations',label:'Finance ops'})
    links.push({href:'/finance/reconciliation',label:'Reconciliation'})
  }
  if(occupancyRoles.has(role))links.push({href:'/occupancy-lifecycle',label:'Move-in / move-out'})
  if(amenityRoles.has(role)&&features.has('AMENITIES'))links.push({href:'/amenities',label:'Amenities'})
  if(marketplaceRoles.has(role)&&features.has('HOUSEHOLD_SERVICES'))links.push({href:'/marketplace-control',label:'Marketplace controls'})
  if(role==='SOCIETY_ADMIN')links.push({href:'/household-approvals',label:'Household approvals'})
  if(societySetupRoles.has(role)){
    links.push({href:'/property',label:'Property setup'})
    links.push({href:'/roles',label:'People & roles'})
    links.push({href:'/parking',label:'Parking'})
  }
  if(role==='SUPER_ADMIN'){
    links.push({href:'/platform/providers',label:'Provider verification'})
    links.push({href:'/marketplace-control/commercial',label:'Commercial controls'})
    links.push({href:'/marketplace-control/operations',label:'Services operations'})
    links.push({href:'/platform',label:'Platform'})
  }
  return <nav aria-label="Admin shortcuts" style={{position:'fixed',right:24,bottom:24,zIndex:20,display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end',maxWidth:760}}>{links.map((link,index)=><a key={link.href} href={link.href} style={{padding:'11px 14px',borderRadius:12,background:index===links.length-1&&role==='SUPER_ADMIN'?'#05879A':'#111827',color:'white',textDecoration:'none',fontWeight:700,boxShadow:'0 8px 24px rgba(0,0,0,.16)'}}>{link.label}</a>)}</nav>
}
