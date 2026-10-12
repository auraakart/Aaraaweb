'use client'

import {useCallback, useEffect, useState, type CSSProperties, type FormEvent} from 'react'
import {api, type Session} from '../lib/admin-client'
import {operatorConfirm} from '../lib/operator-dialog'
import {parseAdminSocietyBrand} from '../lib/admin-society-brand'
import {currentPublishedBrand, draftBrandConfig, parseSocietyBrandRevisions, type SocietyBrandRevision} from '../lib/admin-society-brand-editor'
import {Header} from './admin-ui-primitives'

type Props={session:Session;onPublished:()=>void}
export function AdminSocietyBrandEditor({session,onPublished}:Props){
  const[revisions,setRevisions]=useState<SocietyBrandRevision[]>([])
  const[loading,setLoading]=useState(true)
  const[busy,setBusy]=useState(false)
  const[error,setError]=useState('')
  const[notice,setNotice]=useState('')
  const[name,setName]=useState(session.societyName)
  const[primary,setPrimary]=useState('#155E75')
  const[primaryDeep,setPrimaryDeep]=useState('#164E63')
  const refresh=useCallback(async()=>{
    const response=await api<unknown>('/branding/manage/revisions',{},session)
    setRevisions(parseSocietyBrandRevisions(response))
  },[session])
  useEffect(()=>{
    let live=true
    void api<unknown>('/branding/manage/revisions',{},session)
      .then(response=>{if(live)setRevisions(parseSocietyBrandRevisions(response))})
      .catch(e=>{if(live)setError(e instanceof Error?e.message:'Unable to load brand revisions')})
      .finally(()=>{if(live)setLoading(false)})
    return()=>{live=false}
  },[session])
  const published=currentPublishedBrand(revisions)
  const latestVersion=revisions[0]?.version??0
  let draft:ReturnType<typeof draftBrandConfig>|null=null
  let validation=''
  try{draft=draftBrandConfig(name,primary,primaryDeep)}
  catch(e){validation=e instanceof Error?e.message:'Invalid brand configuration'}
  // Reuse the already audited Admin palette parser: unsafe white-text contrast
  // never gets inserted into a runtime CSS custom property.
  const preview=draft?parseAdminSocietyBrand({
    society:{id:session.societyId},
    branding:{schemaVersion:1,revision:'editor-preview',
      brand:{id:'aaraagate',displayName:draft.displayName,colors:draft.colors}},
  },session.societyId):null
  if(draft&&!preview)validation='Both theme colors must support accessible white text (WCAG AA)'
  const create=async(event:FormEvent)=>{
    event.preventDefault()
    if(!draft||!preview||busy)return
    setBusy(true);setError('');setNotice('')
    try{
      await api('/branding/manage/drafts',{method:'POST',
        body:JSON.stringify({expectedVersion:latestVersion,config:draft})},session)
      await refresh()
      setNotice('Draft saved. Review the immutable revision below before publishing.')
    }catch(e){setError((e instanceof Error?e.message:'Draft save failed')+' — refresh revisions before retrying.')}
    finally{setBusy(false)}
  }
  const publish=async(item:SocietyBrandRevision)=>{
    if(busy||item.publishedAt!==null||item.version<=(published?.version??0))return
    if(!await operatorConfirm('Publish society branding revision '+item.version+' to Resident, Guard and Admin?'))return
    setBusy(true);setError('');setNotice('')
    try{
      await api('/branding/manage/drafts/'+encodeURIComponent(item.id)+'/publish',{
        method:'POST',body:JSON.stringify({expectedPublishedVersion:published?.version??0}),
      },session)
      await refresh()
      onPublished()
      setNotice('Published branding revision '+item.version+'. Active clients refresh from their authenticated context.')
    }catch(e){setError((e instanceof Error?e.message:'Publish failed')+' — reload history to resolve a version conflict.')}
    finally{setBusy(false)}
  }
  const copy=(item:SocietyBrandRevision)=>{
    setName(item.config.displayName??session.societyName)
    setPrimary(item.config.colors?.primary??'#155E75')
    setPrimaryDeep(item.config.colors?.primaryDeep??'#164E63')
    setNotice('Values copied for a new draft; the original revision remains immutable.')
    setError('')
  }
  const previewStyle:CSSProperties=preview?{
    background:preview.primaryDeep,color:'#FFFFFF',
    borderColor:preview.primary,
  }:{}
  return <>
    <Header title="Society branding" society="Draft, preview and publish presentation-only colors and names"/>
    <div className="toolbar billingToolbar"><p>Branding changes appearance only. It never changes user permissions, society ownership, entitlements, legal issuer details, or app identity.</p>
      <button onClick={()=>void refresh().catch(e=>setError(e instanceof Error?e.message:'Refresh failed'))} disabled={busy}>Reload revisions</button>
    </div>
    {error&&<div role="alert" className="error">{error}</div>}
    {notice&&<p role="status" className="brand-editor-status">{notice}</p>}
    <div className="brand-editor-grid">
      <form className="panel form brand-editor-form" onSubmit={e=>void create(e)}>
        <h2>New society-brand draft</h2>
        <label>Display name<input value={name} maxLength={80} required onChange={e=>setName(e.target.value)} /></label>
        <label>Primary color (hex)<input value={primary} maxLength={7} required onChange={e=>setPrimary(e.target.value)} placeholder="#155E75"/></label>
        <label>Deep primary (hex)<input value={primaryDeep} maxLength={7} required onChange={e=>setPrimaryDeep(e.target.value)} placeholder="#164E63"/></label>
        <p className="brand-editor-help">Six-digit hex only. Both backgrounds must support readable white text. Success, error and gate-status colors are not editable.</p>
        {validation&&<p role="alert" className="error">{validation}</p>}
        <button className="primary" disabled={busy||loading||!!validation} type="submit">{busy?'Saving…':'Save as new draft'}</button>
      </form>
      <section className="panel brand-editor-preview">
        <h2>Live preview (not yet published)</h2>
        <div className="brand-editor-swatch" style={previewStyle}><strong>{preview?.displayName??'Preview unavailable'}</strong><span>Resident · Guard · Admin</span><span>Example navigation and primary action</span></div>
        <p>Currently published: <strong>{published?'Version '+published.version:'Built-in Aaraagate default'}</strong></p>
        <p>Next draft version: <strong>{latestVersion+1}</strong></p>
      </section>
    </div>
    <section className="panel brand-editor-history">
      <h2>Immutable revision history</h2>
      {loading?<p>Loading revisions…</p>:revisions.length===0?<p>No society-specific revisions. The default Aaraagate brand remains active.</p>:
        <ul>{revisions.map(item=><li key={item.id}>
          <div><strong>Version {item.version}</strong> · {item.publishedAt?item.id===published?.id?'Current published':'Previously published':'Draft'}
            <p>{item.config.displayName??'Default display name'}{item.config.colors?' · '+item.config.colors.primary+' / '+item.config.colors.primaryDeep:''}</p></div>
          <div className="buttons">
            <button type="button" disabled={busy} onClick={()=>copy(item)}>Use values for new draft</button>
            {!item.publishedAt&&item.version>(published?.version??0)&&
              <button type="button" className="primary" disabled={busy} onClick={()=>void publish(item)}>Publish</button>}
          </div>
        </li>)}</ul>}
      <p className="brand-editor-help">Publication is version-checked. Existing published records cannot be changed; to restore a previous appearance, create and publish a new revision using its values.</p>
    </section>
  </>
}
