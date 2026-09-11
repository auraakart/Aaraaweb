import type { ReactNode } from 'react'

export default function ProviderLayout({children}:{children:ReactNode}){
  return <>
    <div style={{position:'fixed',right:18,bottom:18,zIndex:50}}>
      <a href="/provider/media" style={{display:'inline-flex',alignItems:'center',gap:8,padding:'10px 14px',borderRadius:999,background:'#05879A',color:'white',fontWeight:800,textDecoration:'none',boxShadow:'0 8px 24px rgba(15,23,42,.18)'}} aria-label="Open provider profile media">
        Profile media
      </a>
    </div>
    {children}
  </>
}
