'use client'

import { useEffect,useState } from 'react'

type Session={accessToken:string;role:string;societyName?:string}
type Metrics={activeAssets:number;activePlans:number;activeWorkOrders:number;overdueWorkOrders:number;openAlerts:number;criticalAlerts:number;contractsExpiring30d:number}
type Asset={id:string;code:string;name:string;category:string;location?:string|null;status:'ACTIVE'|'OUT_OF_SERVICE'|'RETIRED'}
const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
const readRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER','COMMITTEE_MEMBER'])
const manageRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER'])
function getSession():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw):null}catch{return null}}
async function api<T>(s:Session,path:string,init:RequestInit={}):Promise<T>{const r=await fetch(`${base}/api/v1${path}`,{...init,headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.accessToken}`,...init.headers}});const text=await r.text(),body=text?JSON.parse(text):null;if(!r.ok)throw new Error(Array.isArray(body?.message)?body.message.join(', '):body?.message??`Request failed (${r.status})`);return body as T}
export default function FacilitiesHealthPage(){
 const s=typeof window==='undefined'?null:getSession(),canRead=!!s&&readRoles.has(s.role),canManage=!!s&&manageRoles.has(s.role)
 const[metrics,setMetrics]=useState<Metrics|null>(null),[assets,setAssets]=useState<Asset[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('')
 async function load(){if(!s||!canRead)return;setBusy(true);setError('');try{const[m,a]=await Promise.all([api<Metrics>(s,'/facilities/preventive-plans/metrics'),api<Asset[]>(s,'/facilities/assets')]);setMetrics(m);setAssets(a)}catch(e){setError(e instanceof Error?e.message:'Could not load facilities health')}finally{setBusy(false)}}
 useEffect(()=>{void load()},[])
 async function setAssetStatus(id:string,status:Asset['status']){if(!s||!canManage)return;setBusy(true);setError('');try{await api(s,`/facilities/assets/${id}/status`,{method:'POST',body:JSON.stringify({status})});await load()}catch(e){setError(e instanceof Error?e.message:'Could not update asset status')}finally{setBusy(false)}}
 if(!s||!canRead)return <main style={{padding:32}}><h1>Facilities access required</h1><a href="/">Return to Admin</a></main>
 const cards:[string,number,string][]=[['Active assets',metrics?.activeAssets??0,'Current common-area equipment in service'],['Preventive plans',metrics?.activePlans??0,'Enabled maintenance schedules'],['Active work orders',metrics?.activeWorkOrders??0,'Open or in progress'],['Overdue work orders',metrics?.overdueWorkOrders??0,'Past due and still active'],['Open alerts',metrics?.openAlerts??0,'Operational alerts needing attention'],['Critical alerts',metrics?.criticalAlerts??0,'Highest priority facilities alerts'],['Contracts ≤30 days',metrics?.contractsExpiring30d??0,'AMC/warranty/service contracts nearing expiry']]
 return <main style={{maxWidth:1180,margin:'0 auto',padding:'28px 22px 80px'}}><header><small>{s.societyName??'Current society'} · {s.role.replaceAll('_',' ')}</small><h1>Facilities health</h1><p>Operational health, maintenance risk and asset service state for common-area facilities.</p><div style={links}><a href="/facilities">Facilities ops</a><a href="/facilities/preventive">Preventive maintenance</a><a href="/facilities/alerts">Alerts</a><a href="/facilities/contracts">AMC & evidence</a></div></header>{error&&<p style={errorBox}>{error}</p>}<section style={cardGrid}>{cards.map(([label,value,description])=><div key={label} style={panel}><small>{label}</small><div style={metric}>{value}</div><p style={{marginBottom:0,color:'#64748b'}}>{description}</p></div>)}</section><section style={{...panel,marginTop:18}}><div style={row}><div><h2 style={{margin:'0 0 4px'}}>Asset lifecycle</h2><p style={{margin:0,color:'#64748b'}}>Move equipment out of service for maintenance or retire it permanently.</p></div><button disabled={busy} onClick={()=>void load()} style={secondary}>Refresh</button></div>{assets.length===0?<p>No facility assets.</p>:assets.map(a=><div key={a.id} style={item}><span><b>{a.code} · {a.name}</b><br/><small>{a.category}{a.location?` · ${a.location}`:''} · {a.status.replaceAll('_',' ')}</small></span>{canManage&&<span style={actions}>{a.status==='ACTIVE'&&<button disabled={busy} style={secondary} onClick={()=>void setAssetStatus(a.id,'OUT_OF_SERVICE')}>Mark out of service</button>}{a.status==='OUT_OF_SERVICE'&&<button disabled={busy} style={button} onClick={()=>void setAssetStatus(a.id,'ACTIVE')}>Return to service</button>}{a.status!=='RETIRED'&&<button disabled={busy} style={danger} onClick={()=>void setAssetStatus(a.id,'RETIRED')}>Retire</button>}</span>}</div>)}</section></main>
}
const panel={background:'#fff',border:'1px solid #e5e7eb',borderRadius:18,padding:20,boxShadow:'0 8px 24px rgba(15,23,42,.05)'}
const cardGrid={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:14,marginTop:18}
const row={display:'flex',alignItems:'center',justifyContent:'space-between',gap:16}
const item={display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,padding:'14px 0',borderBottom:'1px solid #eef2f7'}
const actions={display:'flex',gap:8,flexWrap:'wrap' as const,justifyContent:'flex-end'}
const links={display:'flex',gap:14,flexWrap:'wrap' as const}
const metric={fontSize:34,fontWeight:800,marginTop:8}
const button={border:0,borderRadius:10,padding:'9px 12px',background:'#05879A',color:'#fff',fontWeight:700,cursor:'pointer'}
const secondary={border:'1px solid #cbd5e1',borderRadius:10,padding:'9px 12px',background:'#fff',fontWeight:700,cursor:'pointer'}
const danger={border:'1px solid #fecaca',borderRadius:10,padding:'9px 12px',background:'#fff1f2',color:'#b91c1c',fontWeight:700,cursor:'pointer'}
const errorBox={background:'#fff1f2',border:'1px solid #fecdd3',padding:12,borderRadius:10,color:'#9f1239'}
