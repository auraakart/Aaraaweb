'use client'

import { ChangeEvent, useCallback, useEffect, useState } from 'react'

type AuthSession={sessionId:string;accessToken:string;refreshToken:string}
type ProviderMedia={id:string;providerId:string;kind:'LOGO'|'GALLERY';publicUrl?:string|null;altText?:string|null;sortOrder:number;status:'PENDING'|'APPROVED'|'REJECTED'|'REMOVED';contentType?:string|null;contentLengthBytes?:number|null;originalFileName?:string|null;uploadedAt?:string|null;reviewedAt?:string|null;reviewNote?:string|null;createdAt:string;updatedAt:string}
type UploadIntent={media:ProviderMedia;upload:{uploadUrl:string;method:'PUT';headers:Record<string,string>;expiresAt:string;publicUrl?:string|null}}

const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
const storageKey='aaraagate.provider.session'
const maxBytes=5*1024*1024
const allowedTypes=new Set(['image/jpeg','image/png','image/webp'])

async function api<T>(session:AuthSession,path:string,init:RequestInit={}):Promise<T>{
  const response=await fetch(`${base}/api/v1${path}`,{...init,headers:{Accept:'application/json','Content-Type':'application/json',Authorization:`Bearer ${session.accessToken}`,...init.headers}})
  const text=await response.text();const body=text?JSON.parse(text):null
  if(!response.ok)throw new Error(body?.message??`Request failed (${response.status})`)
  return body as T
}

function readSession():AuthSession|null{
  try{const raw=sessionStorage.getItem(storageKey);return raw?JSON.parse(raw) as AuthSession:null}catch{return null}
}

export default function ProviderMediaPage(){
  const[session,setSession]=useState<AuthSession|null>(null),[media,setMedia]=useState<ProviderMedia[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[kind,setKind]=useState<'LOGO'|'GALLERY'>('GALLERY'),[altText,setAltText]=useState(''),[file,setFile]=useState<File|null>(null)
  const load=useCallback(async(s:AuthSession)=>{setLoading(true);setError('');try{setMedia(await api<ProviderMedia[]>(s,'/provider/services/media'))}catch(e){setError(e instanceof Error?e.message:'Provider media could not be loaded')}finally{setLoading(false)}},[])
  useEffect(()=>{const s=readSession();setSession(s);if(s)void load(s);else setLoading(false)},[load])
  const pick=(e:ChangeEvent<HTMLInputElement>)=>{setError('');setNotice('');const next=e.target.files?.[0]??null;if(!next){setFile(null);return}if(!allowedTypes.has(next.type)){setError('Choose a JPEG, PNG or WebP image. SVG and other formats are not accepted.');e.target.value='';return}if(next.size<=0||next.size>maxBytes){setError('Image size must be between 1 byte and 5 MB.');e.target.value='';return}setFile(next)}
  const upload=async()=>{if(!session||!file)return;setBusy(true);setError('');setNotice('');try{
    const intent=await api<UploadIntent>(session,'/provider/services/media/upload-intent',{method:'POST',body:JSON.stringify({kind,contentType:file.type,contentLengthBytes:file.size,originalFileName:file.name,altText:altText.trim()||undefined})})
    const headers=new Headers(intent.upload.headers);if(!headers.has('Content-Type'))headers.set('Content-Type',file.type)
    const result=await fetch(intent.upload.uploadUrl,{method:intent.upload.method,headers,body:file})
    if(!result.ok)throw new Error(`Image upload failed (${result.status})`)
    await api(session,`/provider/services/media/${intent.media.id}/confirm`,{method:'POST'})
    setFile(null);setAltText('');setNotice('Image uploaded securely and submitted for platform review. It will not appear to residents until approved.');await load(session)
  }catch(e){setError(e instanceof Error?e.message:'Image could not be uploaded')}finally{setBusy(false)}}
  const remove=async(item:ProviderMedia)=>{if(!session)return;if(!confirm('Remove this image from your provider profile?'))return;setBusy(true);setError('');setNotice('');try{await api(session,`/provider/services/media/${item.id}`,{method:'DELETE'});setNotice('Image removed from provider media.');await load(session)}catch(e){setError(e instanceof Error?e.message:'Image could not be removed')}finally{setBusy(false)}}
  if(!session)return <main style={center}><section style={panel}><h1>Provider media</h1><p>No provider session is available.</p><a href="/provider">Sign in to provider workspace</a></section></main>
  return <main style={{minHeight:'100vh',background:'#f5f8f9'}}><header style={topbar}><div><div style={brand}>aaraagate</div><small style={muted}>Provider workspace · Media</small></div><a href="/provider">← Provider workspace</a></header><div style={{maxWidth:1050,margin:'0 auto',padding:'24px 20px 64px'}}><section style={panel}><h1 style={{marginTop:0}}>Provider profile images</h1><p style={muted}>Upload a logo or portfolio images. Images are private to the moderation workflow until a platform reviewer approves them.</p>{error&&<div style={errorBox}>{error}</div>}{notice&&<div style={noticeBox}>{notice}</div>}<div style={uploadGrid}><label>Image type<select style={input} value={kind} onChange={e=>setKind(e.target.value as 'LOGO'|'GALLERY')}><option value="GALLERY">Gallery image</option><option value="LOGO">Business logo</option></select></label><label>Alt text<input style={input} maxLength={160} placeholder="Describe the image for accessibility" value={altText} onChange={e=>setAltText(e.target.value)}/></label><label>Image<input style={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={pick}/></label><div><button style={primary} disabled={busy||!file} onClick={()=>void upload()}>{busy?'Uploading…':'Upload for review'}</button></div></div><small style={muted}>JPEG, PNG or WebP · maximum 5 MB · one active/pending logo · up to eight active/pending gallery images.</small></section><section style={panel}><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}><div><h2 style={{margin:'0 0 4px'}}>Your media</h2><small style={muted}>Only APPROVED images are eligible for resident storefront display.</small></div><button style={button} disabled={loading||busy} onClick={()=>void load(session)}>Refresh</button></div>{loading?<p>Loading media…</p>:media.length===0?<p>No provider images uploaded yet.</p>:<div style={grid}>{media.map(item=><article key={item.id} style={card}>{item.publicUrl?<img src={item.publicUrl} alt={item.altText||item.originalFileName||'Provider media'} style={preview}/>:<div style={placeholder}>Preview unavailable until storage is configured</div>}<div style={{display:'grid',gap:5}}><div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}><strong>{item.kind==='LOGO'?'Business logo':'Gallery image'}</strong><span style={badge}>{item.status}</span></div><small>{item.originalFileName??'Image'}{item.contentLengthBytes?` · ${(item.contentLengthBytes/1024/1024).toFixed(2)} MB`:''}</small>{item.altText&&<small>{item.altText}</small>}{item.reviewNote&&<small>Review note: {item.reviewNote}</small>}<button style={button} disabled={busy} onClick={()=>void remove(item)}>Remove</button></div></article>)}</div>}</section></div></main>
}

const center:React.CSSProperties={minHeight:'100vh',display:'grid',placeItems:'center',padding:24,background:'#f5f8f9'}
const topbar:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',padding:'16px 22px',background:'white',borderBottom:'1px solid #dbe7ea',flexWrap:'wrap'}
const brand:React.CSSProperties={fontSize:22,fontWeight:800,color:'#05879A',letterSpacing:.2}
const muted:React.CSSProperties={color:'#64748b'}
const panel:React.CSSProperties={marginBottom:20,padding:20,border:'1px solid #dbe7ea',borderRadius:16,background:'white'}
const uploadGrid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:12,alignItems:'end',margin:'18px 0 10px'}
const grid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:14,marginTop:16}
const card:React.CSSProperties={display:'grid',gap:12,padding:12,border:'1px solid #e5e7eb',borderRadius:14}
const preview:React.CSSProperties={width:'100%',height:170,objectFit:'cover',borderRadius:10,background:'#f1f5f9'}
const placeholder:React.CSSProperties={height:170,display:'grid',placeItems:'center',padding:18,borderRadius:10,background:'#f1f5f9',color:'#64748b',textAlign:'center'}
const input:React.CSSProperties={display:'block',width:'100%',marginTop:6,padding:10,border:'1px solid #cbd5e1',borderRadius:10,background:'white'}
const button:React.CSSProperties={padding:'9px 12px',borderRadius:10,border:'1px solid #cbd5e1',background:'white',fontWeight:700}
const primary:React.CSSProperties={...button,background:'#05879A',color:'white',borderColor:'#05879A'}
const badge:React.CSSProperties={padding:'4px 8px',borderRadius:999,background:'#eef7f8',fontSize:12,fontWeight:800}
const errorBox:React.CSSProperties={marginTop:12,padding:12,border:'1px solid #ef4444',borderRadius:10,background:'#fff7f7'}
const noticeBox:React.CSSProperties={marginTop:12,padding:12,border:'1px solid #86efac',borderRadius:10,background:'#f0fdf4'}
