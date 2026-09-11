'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type Session={accessToken:string;role?:string}
type Provider={id:string;businessName:string;description?:string|null;verification:string}
type Catalog={providers:Provider[]}
type SubscriptionTier='BASIC'|'GROWTH'|'PREMIUM'
type PlacementType='NONE'|'FEATURED'|'SPONSORED'
type CommercialProfile={
  providerId:string
  subscriptionTier:SubscriptionTier
  subscriptionStartsAt?:string|null
  subscriptionEndsAt?:string|null
  placementType:PlacementType
  placementStartsAt?:string|null
  placementEndsAt?:string|null
  active:boolean
  subscriptionCurrent:boolean
  placementCurrent:boolean
}
type CommercialForm={
  subscriptionTier:SubscriptionTier
  subscriptionStartsAt:string
  subscriptionEndsAt:string
  placementType:PlacementType
  placementStartsAt:string
  placementEndsAt:string
  active:boolean
}

const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
function storedSession():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw) as Session:null}catch{return null}}
async function api<T>(s:Session,path:string,init:RequestInit={}):Promise<T>{const r=await fetch(`${base}/api/v1${path}`,{...init,headers:{Accept:'application/json','Content-Type':'application/json',Authorization:`Bearer ${s.accessToken}`,...init.headers}});const text=await r.text();const body=text?JSON.parse(text):null;if(!r.ok)throw new Error(body?.message??`Request failed (${r.status})`);return body as T}
const emptyForm:CommercialForm={subscriptionTier:'BASIC',subscriptionStartsAt:'',subscriptionEndsAt:'',placementType:'NONE',placementStartsAt:'',placementEndsAt:'',active:true}
function localInput(value?:string|null){if(!value)return '';const d=new Date(value);if(Number.isNaN(d.getTime()))return '';const shifted=new Date(d.getTime()-d.getTimezoneOffset()*60000);return shifted.toISOString().slice(0,16)}
function isoOrUndefined(value:string){return value?new Date(value).toISOString():undefined}
function formFrom(profile:CommercialProfile):CommercialForm{return{subscriptionTier:profile.subscriptionTier,subscriptionStartsAt:localInput(profile.subscriptionStartsAt),subscriptionEndsAt:localInput(profile.subscriptionEndsAt),placementType:profile.placementType,placementStartsAt:localInput(profile.placementStartsAt),placementEndsAt:localInput(profile.placementEndsAt),active:profile.active}}
function validateWindow(start:string,end:string,label:string){if(!start||!end)return `${label} start and end are required`;if(new Date(end)<=new Date(start))return `${label} end must be after start`;return ''}

export default function CommercialControlsPage(){
  const[s,setS]=useState<Session|null>(null),[providers,setProviders]=useState<Provider[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[query,setQuery]=useState('')
  const[selected,setSelected]=useState<Provider|null>(null),[form,setForm]=useState<CommercialForm>(emptyForm),[profile,setProfile]=useState<CommercialProfile|null>(null),[profileLoading,setProfileLoading]=useState(false),[saving,setSaving]=useState(false)
  const allowed=s?.role==='SUPER_ADMIN'
  const load=useCallback(async(x:Session)=>{setLoading(true);setError('');try{const catalog=await api<Catalog>(x,'/services-marketplace/admin/catalog');setProviders(catalog.providers??[])}catch(e){setError(e instanceof Error?e.message:'Providers could not be loaded')}finally{setLoading(false)}},[])
  useEffect(()=>{const x=storedSession();setS(x);if(x?.role==='SUPER_ADMIN')void load(x);else setLoading(false)},[load])
  const visible=useMemo(()=>{const q=query.trim().toLowerCase();return q?providers.filter(p=>[p.businessName,p.description,p.verification].filter(Boolean).join(' ').toLowerCase().includes(q)):providers},[providers,query])
  const openProvider=async(p:Provider)=>{if(!s)return;setSelected(p);setProfile(null);setProfileLoading(true);setError('');try{const next=await api<CommercialProfile>(s,`/platform/services/providers/${p.id}/commercial`);setProfile(next);setForm(formFrom(next))}catch(e){setError(e instanceof Error?e.message:'Commercial profile could not be loaded');setForm(emptyForm)}finally{setProfileLoading(false)}}
  const save=async()=>{if(!s||!selected)return;setError('');if(form.subscriptionTier!=='BASIC'){const issue=validateWindow(form.subscriptionStartsAt,form.subscriptionEndsAt,'Subscription');if(issue){setError(issue);return}}if(form.placementType!=='NONE'){const issue=validateWindow(form.placementStartsAt,form.placementEndsAt,'Placement');if(issue){setError(issue);return}}setSaving(true);try{const body={subscriptionTier:form.subscriptionTier,subscriptionStartsAt:form.subscriptionTier==='BASIC'?undefined:isoOrUndefined(form.subscriptionStartsAt),subscriptionEndsAt:form.subscriptionTier==='BASIC'?undefined:isoOrUndefined(form.subscriptionEndsAt),placementType:form.placementType,placementStartsAt:form.placementType==='NONE'?undefined:isoOrUndefined(form.placementStartsAt),placementEndsAt:form.placementType==='NONE'?undefined:isoOrUndefined(form.placementEndsAt),active:form.active};const next=await api<CommercialProfile>(s,`/platform/services/providers/${selected.id}/commercial`,{method:'PATCH',body:JSON.stringify(body)});setProfile(next);setForm(formFrom(next))}catch(e){setError(e instanceof Error?e.message:'Commercial profile could not be saved')}finally{setSaving(false)}}
  if(loading)return <main style={{padding:32}}>Loading commercial controls…</main>
  if(!allowed)return <main style={{padding:32}}><h1>Super Admin access required</h1><p>Provider subscriptions and paid placement are platform-only controls.</p><a href="/">Return to Admin</a></main>
  return <main style={{maxWidth:1160,margin:'0 auto',padding:'28px 22px 80px'}}>
    <header style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap'}}><div><small>Platform marketplace</small><h1 style={{margin:'4px 0'}}>Provider commercial controls</h1><p style={{margin:0,maxWidth:760}}>Manage time-bound subscription tiers and paid visibility. These controls never change provider verification, trust status, society approval, organic ordering, booking eligibility or commissions.</p></div><div style={{display:'flex',gap:12}}><a href="/marketplace-control">Marketplace controls</a><a href="/">Admin console</a></div></header>
    {error&&<div style={errorBox}>{error}</div>}
    <section style={panel}><label style={{display:'grid',gap:6,maxWidth:480}}>Find provider<input aria-label="Search providers" placeholder="Search name, description or verification" value={query} onChange={e=>setQuery(e.target.value)} style={input}/></label><div style={{display:'grid',gap:10,marginTop:16}}>{visible.length===0?<p>No matching providers.</p>:visible.map(p=><button key={p.id} onClick={()=>void openProvider(p)} style={{...providerButton,borderColor:selected?.id===p.id?'#05879A':'#e5e7eb',background:selected?.id===p.id?'#ecfeff':'white'}}><span style={{display:'grid',textAlign:'left',gap:3}}><strong>{p.businessName}</strong>{p.description&&<span>{p.description}</span>}<small>Verification: {p.verification}</small></span><span>Configure →</span></button>)}</div></section>
    {selected&&<section style={panel}><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'start',flexWrap:'wrap'}}><div><h2 style={{margin:'0 0 4px'}}>{selected.businessName}</h2><p style={{margin:0}}>Commercial state is platform-managed and intentionally independent of verification/trust.</p></div>{profile&&<div style={{display:'flex',gap:8,flexWrap:'wrap'}}><span style={chip}>Subscription {profile.subscriptionCurrent?'current':'not current'}</span><span style={chip}>Placement {profile.placementCurrent?'current':'not current'}</span></div>}</div>{profileLoading?<p>Loading profile…</p>:<div style={{display:'grid',gap:18,marginTop:18}}>
      <fieldset style={fieldset}><legend style={legend}>Subscription</legend><label style={label}>Tier<select value={form.subscriptionTier} onChange={e=>setForm(v=>({...v,subscriptionTier:e.target.value as SubscriptionTier}))} style={input}><option value="BASIC">Basic</option><option value="GROWTH">Growth</option><option value="PREMIUM">Premium</option></select></label>{form.subscriptionTier!=='BASIC'&&<div style={grid2}><label style={label}>Starts<input type="datetime-local" value={form.subscriptionStartsAt} onChange={e=>setForm(v=>({...v,subscriptionStartsAt:e.target.value}))} style={input}/></label><label style={label}>Ends<input type="datetime-local" value={form.subscriptionEndsAt} onChange={e=>setForm(v=>({...v,subscriptionEndsAt:e.target.value}))} style={input}/></label></div>}<small>Basic has no active subscription window. Growth and Premium require an explicit start and end.</small></fieldset>
      <fieldset style={fieldset}><legend style={legend}>Paid placement</legend><label style={label}>Placement<select value={form.placementType} onChange={e=>setForm(v=>({...v,placementType:e.target.value as PlacementType}))} style={input}><option value="NONE">None</option><option value="FEATURED">Featured</option><option value="SPONSORED">Sponsored</option></select></label>{form.placementType!=='NONE'&&<div style={grid2}><label style={label}>Starts<input type="datetime-local" value={form.placementStartsAt} onChange={e=>setForm(v=>({...v,placementStartsAt:e.target.value}))} style={input}/></label><label style={label}>Ends<input type="datetime-local" value={form.placementEndsAt} onChange={e=>setForm(v=>({...v,placementEndsAt:e.target.value}))} style={input}/></label></div>}<small>Featured and Sponsored placements are explicitly labeled in the resident experience and do not affect organic service ordering.</small></fieldset>
      <label style={{display:'flex',gap:10,alignItems:'center'}}><input type="checkbox" checked={form.active} onChange={e=>setForm(v=>({...v,active:e.target.checked}))}/><span><strong>Commercial profile active</strong><br/><small>Disable to suspend subscription and placement visibility without changing provider verification or society approval.</small></span></label>
      <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}><button onClick={()=>void save()} disabled={saving} style={primary}>{saving?'Saving…':'Save commercial controls'}</button><button onClick={()=>{setSelected(null);setProfile(null);setForm(emptyForm)}} disabled={saving} style={button}>Close</button></div>
    </div>}</section>}
  </main>
}

const panel:React.CSSProperties={marginTop:20,padding:20,border:'1px solid #dbe7ea',borderRadius:16,background:'white'}
const input:React.CSSProperties={padding:11,border:'1px solid #cbd5e1',borderRadius:10,background:'white'}
const providerButton:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',padding:14,border:'1px solid #e5e7eb',borderRadius:12,cursor:'pointer'}
const fieldset:React.CSSProperties={display:'grid',gap:12,padding:16,border:'1px solid #dbe7ea',borderRadius:12}
const legend:React.CSSProperties={fontWeight:800,padding:'0 6px'}
const label:React.CSSProperties={display:'grid',gap:6}
const grid2:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}
const button:React.CSSProperties={padding:'10px 14px',borderRadius:10,border:'1px solid #cbd5e1',background:'white',fontWeight:700,cursor:'pointer'}
const primary:React.CSSProperties={...button,background:'#05879A',borderColor:'#05879A',color:'white'}
const chip:React.CSSProperties={padding:'6px 9px',borderRadius:999,background:'#f0f9ff',border:'1px solid #bae6fd',fontSize:12,fontWeight:800}
const errorBox:React.CSSProperties={marginTop:18,padding:12,border:'1px solid #ef4444',borderRadius:10,background:'#fef2f2'}
