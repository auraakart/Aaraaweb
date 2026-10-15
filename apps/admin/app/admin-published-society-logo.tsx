'use client'

import {useEffect,useState} from 'react'
import type {Session} from '../lib/admin-client'

const apiBase=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
const maxBytes=512*1024

/** Session-bound private PNG preview. No public file key, CDN URL or cross-society cache. */
export function AdminPublishedSocietyLogo({session,revision,enabled}:{
  session:Session;revision:string;enabled:boolean
}){
  const [source,setSource]=useState<string|null>(null)
  useEffect(()=>{
    let live=true
    let objectUrl:string|null=null
    const controller=new AbortController()
    setSource(null)
    if(enabled){
      void (async()=>{
        try{
          const response=await fetch(apiBase+'/api/v1/context/logo',{
            method:'GET',credentials:'omit',cache:'no-store',redirect:'error',
            referrerPolicy:'no-referrer',signal:controller.signal,
            headers:{Authorization:'Bearer '+session.accessToken,Accept:'image/png'},
          })
          if(!response.ok || response.headers.get('content-type')?.split(';',1)[0]?.trim().toLowerCase()!=='image/png')return
          const length=Number(response.headers.get('content-length')??0)
          if(!Number.isSafeInteger(length) || length>maxBytes || length<0)return
          const data=await response.blob()
          if(data.type!=='image/png'||data.size>maxBytes||data.size<57)return
          const url=URL.createObjectURL(data)
          if(!live){URL.revokeObjectURL(url);return}
          objectUrl=url
          setSource(url)
        }catch{
          // An absent, offline or rejected logo must not interrupt branding.
        }
      })()
    }
    return ()=>{
      live=false
      controller.abort()
      if(objectUrl)URL.revokeObjectURL(objectUrl)
    }
  },[session.societyId,session.sessionId,session.accessToken,revision,enabled])

  return <div className="brand-editor-help" aria-label="Currently published society logo">
    {source?
      <img src={source} alt="Currently published society logo" width={88} height={88}
        style={{objectFit:'contain',borderRadius:12}}/>:
      <span>Built-in Aaraagate logo (or published image unavailable)</span>}
  </div>
}
