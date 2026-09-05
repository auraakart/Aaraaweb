'use client'

import { useEffect, useState } from 'react'

const reportRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER','ACCOUNTANT'])
const societySetupRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN'])

export function AdminShortcuts(){
  const[role,setRole]=useState('')
  useEffect(()=>{try{const raw=sessionStorage.getItem('aaraagate.admin.session');if(!raw)return;const session=JSON.parse(raw) as {role?:string};setRole(session.role??'')}catch{setRole('')}},[])
  if(!role)return null
  const links:{href:string;label:string}[]=[]
  if(reportRoles.has(role))links.push({href:'/reports',label:'Reports'})
  if(societySetupRoles.has(role)){
    links.push({href:'/property',label:'Property setup'})
    links.push({href:'/roles',label:'People & roles'})
    links.push({href:'/parking',label:'Parking'})
  }
  if(role==='SUPER_ADMIN')links.push({href:'/platform',label:'Platform'})
  return <nav aria-label="Admin shortcuts" style={{position:'fixed',right:24,bottom:24,zIndex:20,display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end',maxWidth:560}}>{links.map((link,index)=><a key={link.href} href={link.href} style={{padding:'11px 14px',borderRadius:12,background:index===links.length-1&&role==='SUPER_ADMIN'?'#05879A':'#111827',color:'white',textDecoration:'none',fontWeight:700,boxShadow:'0 8px 24px rgba(0,0,0,.16)'}}>{link.label}</a>)}</nav>
}
