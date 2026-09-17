'use client'

import { useEffect, useMemo, useState } from 'react'

type StoredSession={role?:string;accessToken?:string}
type CurrentEntitlements={enabledFeatures?:string[]}
type Card={href:string;title:string;description:string}
const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
const emergencyRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER','SECURITY_SUPERVISOR'])
const privacyRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN'])

export default function OperationsControlPage(){
 const[role,setRole]=useState(''),[features,setFeatures]=useState<Set<string>>(new Set())
 useEffect(()=>{let active=true;const load=async()=>{try{const raw=sessionStorage.getItem('aaraagate.admin.session');if(!raw)return;const session=JSON.parse(raw) as StoredSession;if(!active)return;setRole(session.role??'');if(!session.accessToken)return;const r=await fetch(`${base}/api/v1/entitlements/current`,{headers:{Authorization:`Bearer ${session.accessToken}`}});if(!r.ok)return;const body=await r.json() as CurrentEntitlements;if(active)setFeatures(new Set(body.enabledFeatures??[]))}catch{if(active){setRole('');setFeatures(new Set())}}};void load();return()=>{active=false}},[])
 const cards=useMemo(()=>{const items:Card[]=[];if(emergencyRoles.has(role)&&features.has('SOS'))items.push({href:'/emergency-operations',title:'Emergency control',description:'Acknowledge, coordinate and resolve SOS incidents.'});if(privacyRoles.has(role))items.push({href:'/privacy-operations',title:'Privacy operations',description:'Handle privacy requests and operational controls.'});if(role==='AUDITOR')items.push({href:'/audit',title:'Audit workspace',description:'Review read-only operational and financial evidence.'});if(role==='SUPER_ADMIN')items.push({href:'/platform',title:'Platform administration',description:'Manage cross-society platform configuration and operations.'});return items},[features,role])
 return <main className="ops-control-shell"><header><small>Admin workspace</small><h1>Operations & control</h1><p>Central access to incident response, privacy, audit and platform administration. Each destination keeps its existing role and authorization rules.</p></header><section className="ops-control-grid">{cards.map(card=><a className="ops-control-card" href={card.href} key={card.href}><strong>{card.title}</strong><span>{card.description}</span></a>)}{role&&cards.length===0&&<p>No operations-control tools are assigned to this role.</p>}</section></main>
}
