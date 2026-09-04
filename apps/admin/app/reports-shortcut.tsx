'use client'

import { useEffect, useState } from 'react'

const reportRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER','ACCOUNTANT'])

export function ReportsShortcut(){
  const[visible,setVisible]=useState(false)
  useEffect(()=>{try{const raw=sessionStorage.getItem('aaraagate.admin.session');if(!raw)return;const session=JSON.parse(raw) as {role?:string};setVisible(!!session.role&&reportRoles.has(session.role))}catch{setVisible(false)}},[])
  if(!visible)return null
  return <a href="/reports" style={{position:'fixed',right:24,bottom:24,zIndex:20,padding:'12px 16px',borderRadius:12,background:'#111827',color:'white',textDecoration:'none',fontWeight:700,boxShadow:'0 8px 24px rgba(0,0,0,.18)'}}>Reports</a>
}
