'use client'

import {useCallback,useEffect,useState,type FormEvent} from 'react'
import {api,type Session} from '../lib/admin-client'
import {operatorConfirm} from '../lib/operator-dialog'
import {brandHistoryVersions,isBrandConflict,parseBrandHistory,prepareBrandDraft,type BrandRevision} from '../lib/admin-brand-editor-model'
import {Header} from './admin-ui-primitives'

type DraftResponse={id:string;version:number;publishedAt:null}
type PublishResponse={id:string;version:number;revision:string;published:true}

export function SocietyBrandEditor({session,onPublished}:{session:Session;onPublished:()=>void}){
  const [rows,setRows]=useState<BrandRevision[]>([])
  const [displayName,setDisplayName]=useState(session.societyName)
  const [primary,setPrimary]=useState('#155E75')
  const [primaryDeep,setPrimaryDeep]=useState('#164E63')
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [dirty,setDirty]=useState(false)

  const load=useCallback(async (updateForm:boolean)=>{
    const next=parseBrandHistory(await api<unknown>('/branding/manage/revisions',{},session))
    setRows(next)
    if(updateForm){
      const published=next.find(row=>row.publishedAt!==null)
      setDisplayName(published?.config.displayName??session.societyName)
      setPrimary(published?.config.colors?.primary??'#155E75')
      setPrimaryDeep(published?.config.colors?.primaryDeep??'#164E63')
      setDirty(false)
    }
  },[session])

  useEffect(()=>{
    let active=true
    const refresh=async()=>{
      setLoading(true);setError('')
      try{
        const next=parseBrandHistory(await api<unknown>('/branding/manage/revisions',{},session))
        if(active){
          setRows(next)
          const published=next.find(row=>row.publishedAt!==null)
          setDisplayName(published?.config.displayName??session.societyName)
          setPrimary(published?.config.colors?.primary??'#155E75')
          setPrimaryDeep(published?.config.colors?.primaryDeep??'#164E63')
        }
      }catch(e){
        if(active)setError(e instanceof Error?e.message:'Society branding revisions could not be loaded')
      }finally{if(active)setLoading(false)}
    }
    void refresh()
    return()=>{active=false}
  },[session])

  const versions=brandHistoryVersions(rows)
  const current=rows.find(row=>row.publishedAt!==null)
  let preview:ReturnType<typeof prepareBrandDraft>|null=null
  let previewError=''
  try{preview=prepareBrandDraft({societyId:session.societyId,displayName,primary,primaryDeep})}
  catch(e){previewError=e instanceof Error?e.message:'Invalid society brand'}

  const create=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault()
    if(busy||loading||!preview)return
    setBusy(true);setError('');setMessage('')
    try{
      const created=await api<DraftResponse>('/branding/manage/drafts',{
        method:'POST',body:JSON.stringify({
          expectedVersion:versions.nextExpectedVersion,
          config:preview,
        }),
      },session)
      await load(false)
      setMessage(`Draft version ${created.version} saved. It is not visible to residents until published.`)
      setDirty(false)
    }catch(e){
      if(isBrandConflict(e)){await load(false).catch(()=>undefined);setError('Revisions changed. Latest history is shown; review and save again.')}
      else setError(e instanceof Error?e.message:'Unable to save society brand draft')
    }finally{setBusy(false)}
  }

  const publish=async(revision:BrandRevision)=>{
    if(busy||loading||revision.publishedAt!==null||revision.version<=versions.expectedPublishedVersion)return
    if(!await operatorConfirm(`Publish society branding version ${revision.version}? This changes resident, guard and Admin runtime presentation.`))return
    setBusy(true);setError('');setMessage('')
    try{
      const result=await api<PublishResponse>(`/branding/manage/drafts/${revision.id}/publish`,{
        method:'POST',
        body:JSON.stringify({expectedPublishedVersion:versions.expectedPublishedVersion}),
      },session)
      await load(true)
      setMessage(`Version ${result.version} published. Authenticated clients can now load the new presentation.`)
      onPublished()
    }catch(e){
      if(isBrandConflict(e)){await load(false).catch(()=>undefined);setError('Publication conflict. Refresh and review the latest revision before retrying.')}
      else setError(e instanceof Error?e.message:'Unable to publish society branding')
    }finally{setBusy(false)}
  }

  const reload=async()=>{
    if(busy)return
    setLoading(true);setError('');setMessage('')
    try{await load(!dirty)}
    catch(e){setError(e instanceof Error?e.message:'Unable to reload society brand revisions')}
    finally{setLoading(false)}
  }

  return <section aria-label="Society brand editor">
    <Header title="Society branding" society="Presentation only · current society"/>
    <p>Change the society display name and approved colors without rebuilding the apps. Publishing does not change roles, permissions, billing, gate access or the legal society name.</p>
    {error&&<div className="error" role="alert">{error}</div>}
    {message&&<p className="brandEditorMessage" role="status">{message}</p>}
    <div className="brandEditorGrid">
      <form className="panel form brandEditorForm" onSubmit={e=>void create(e)}>
        <h2>Create a brand draft</h2>
        <label>Display name
          <input aria-label="Society brand display name" value={displayName} onChange={e=>{setDisplayName(e.target.value);setDirty(true)}} maxLength={80} required disabled={busy||loading}/>
        </label>
        <label>Primary color (hex)
          <input aria-label="Society primary color" value={primary} onChange={e=>{setPrimary(e.target.value);setDirty(true)}} maxLength={7} required disabled={busy||loading}/>
        </label>
        <label>Deep primary color (hex)
          <input aria-label="Society deep primary color" value={primaryDeep} onChange={e=>{setPrimaryDeep(e.target.value);setDirty(true)}} maxLength={7} required disabled={busy||loading}/>
        </label>
        <p className="brandEditorHint">Both colors must pass AA contrast with white labels (4.5:1). Arbitrary CSS, links and feature settings are not accepted.</p>
        {previewError&&<p className="brandEditorInvalid" role="status">{previewError}</p>}
        <button className="primary" disabled={busy||loading||!preview} type="submit">
          {busy?'Saving…':'Save new draft'}
        </button>
      </form>
      <section className="panel brandEditorPreview" aria-label="Draft presentation preview">
        <h2>Preview — not published</h2>
        {preview?<div className="brandEditorSample" style={{background:preview.colors.primaryDeep,color:'#FFFFFF'}}>
          <strong>{preview.displayName}</strong>
          <span>Resident · Guard · Admin</span>
          <span className="brandEditorSampleButton" style={{background:preview.colors.primary,color:'#FFFFFF'}}>Primary action</span>
        </div>:<p>Enter a safe name and accessible colors to preview the draft.</p>}
        <p className="brandEditorHint">Actual gate alerts, critical statuses, platform capabilities and offline behavior are unchanged.</p>
      </section>
    </div>
    <section className="panel brandEditorHistory" aria-label="Society brand revision history">
      <div className="brandEditorHistoryTitle">
        <h2>Revision history</h2>
        <button type="button" onClick={()=>void reload()} disabled={busy||loading}>{loading?'Loading…':'Refresh history'}</button>
      </div>
      <p className="brandEditorHint">Latest revision: v{versions.nextExpectedVersion}. Live published version: {current?`v${current.version}`:'Aaraagate default'}.</p>
      {!loading&&rows.length===0&&<p>No revisions yet. The built-in Aaraagate presentation is active.</p>}
      <div className="brandEditorRevisions">
        {rows.map(row=>{
          const isCurrent=row.id===current?.id
          const canPublish=!row.publishedAt&&row.version>versions.expectedPublishedVersion
          return <div className="brandEditorRevision" key={row.id}>
            <div>
              <strong>Version {row.version}</strong>
              <span>{isCurrent?'Current published':row.publishedAt?'Previously published':'Unpublished draft'}</span>
              <small>{row.config.displayName??'Default society name'} · {new Date(row.createdAt).toLocaleString()}</small>
            </div>
            {canPublish&&<button type="button" onClick={()=>void publish(row)} disabled={busy||loading}>Publish v{row.version}</button>}
          </div>
        })}
      </div>
    </section>
  </section>
}
