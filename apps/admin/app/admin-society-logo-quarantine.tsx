'use client'

import {useCallback, useEffect, useState, type ChangeEvent} from 'react'
import {api, type Session} from '../lib/admin-client'
import {
  parseSocietyLogoAssets, parseSocietyLogoUploadIntent, validateSocietyLogoFile,
  type SocietyLogoAsset,
} from '../lib/admin-society-logo'

/** Private asset review only. This component never adds a logo to a published brand revision. */
export function AdminSocietyLogoQuarantine({session,onAssetsChanged}:{session:Session;onAssetsChanged?:(assets:SocietyLogoAsset[])=>void}) {
  const [assets,setAssets]=useState<SocietyLogoAsset[]>([])
  const [file,setFile]=useState<File|null>(null)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [lastExpires,setLastExpires]=useState<string|null>(null)

  const refresh=useCallback(async()=>{
    const rows=await api<unknown>('/branding/manage/logos',{},session)
    const valid=parseSocietyLogoAssets(rows)
    setAssets(valid)
    onAssetsChanged?.(valid)
  },[session,onAssetsChanged])

  useEffect(()=>{
    let active=true
    setAssets([])
    setFile(null)
    setError('')
    setNotice('')
    setLastExpires(null)
    setLoading(true)
    void api<unknown>('/branding/manage/logos',{},session)
      .then(value=>{if(active){const valid=parseSocietyLogoAssets(value);setAssets(valid);onAssetsChanged?.(valid)}})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'Unable to load private logo assets')})
      .finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[session,onAssetsChanged])

  const upload=async()=>{
    if(!file||busy)return
    let descriptor:ReturnType<typeof validateSocietyLogoFile>
    try {descriptor=validateSocietyLogoFile(file)}
    catch(e){setError(e instanceof Error?e.message:'Unsupported PNG file');return}
    setBusy(true);setError('');setNotice('')
    try{
      const payload=await api<unknown>('/branding/manage/logos/uploads',{
        method:'POST',body:JSON.stringify(descriptor),
      },session)
      const intent=parseSocietyLogoUploadIntent(payload)
      // Signed object URL is used only for this PUT. Never send bearer credentials,
      // follow redirects or persist its secret query string in the dashboard.
      const result=await fetch(intent.upload.url,{
        method:'PUT',headers:intent.upload.headers,body:file,credentials:'omit',
        redirect:'error',referrerPolicy:'no-referrer',cache:'no-store',
      })
      if(!result.ok)throw new Error('Private object upload failed ('+result.status+')')
      await refresh()
      setFile(null)
      setLastExpires(intent.upload.expiresAt)
      setNotice('PNG uploaded privately. Verify after the upload link expires; this does not publish a logo.')
    }catch(e){
      setError((e instanceof Error?e.message:'Logo upload failed')+
        '. Check private object storage and CORS; any unused upload reservation remains pending until reviewed.')
    }finally{setBusy(false)}
  }

  const verifyLogo=async(asset:SocietyLogoAsset)=>{
    if(busy||asset.status!=='PENDING')return
    setBusy(true);setError('');setNotice('')
    try{
      await api('/branding/manage/logos/'+encodeURIComponent(asset.id)+'/confirm',{
        method:'POST',body:'{}',
      },session)
      await refresh()
      setNotice('Logo verified by the server and malware scanner. Select it in a new branding revision to publish.')
    }catch(e){
      setError((e instanceof Error?e.message:'Logo verification failed')+
        '. Confirmation requires the signed upload link to have expired and a clean PNG scan.')
    }finally{setBusy(false)}
  }

  const onFile=(event:ChangeEvent<HTMLInputElement>)=>{
    setFile(event.target.files?.[0]??null)
    setError('')
  }

  const cancelLogo=async(item:SocietyLogoAsset)=>{
    if(busy)return
    setBusy(true);setError('')
    try{await api('/branding/manage/logos/'+encodeURIComponent(item.id)+'/cancel',{method:'POST'},session);await refresh();setNotice('Unused upload cancelled. You can upload another logo.')}
    catch(e){setError(e instanceof Error?e.message:'Unable to cancel upload')}
    finally{setBusy(false)}
  }
  return <section className="panel brand-editor-history" aria-labelledby="society-logo-title">
    <h2 id="society-logo-title">Private society logo review</h2>
    <p className="brand-editor-help">
      PNG only, 512 KiB maximum, 64–1024 pixels. Logo files remain private. Only VERIFIED images may be selected
      for a new immutable branding revision in the society editor.
    </p>
    <label>Choose PNG logo for safety review
      <input type="file" accept="image/png,.png" onChange={onFile} disabled={busy}/>
    </label>
    <div className="buttons">
      <button className="primary" type="button" disabled={!file||busy||loading}
        onClick={()=>void upload()}>{busy?'Working…':'Upload privately for review'}</button>
      <button type="button" disabled={busy} onClick={()=>void refresh().catch(e=>setError(
        e instanceof Error?e.message:'Unable to refresh logos'))}>Refresh status</button>
    </div>
    {lastExpires&&<p className="brand-editor-help">
      Latest upload link expires: <time dateTime={lastExpires}>{new Date(lastExpires).toLocaleString()}</time>.
      Verification can start only after this time.
    </p>}
    {error&&<p role="alert" className="error">{error}</p>}
    {notice&&<p role="status" className="brand-editor-status">{notice}</p>}
    {loading?<p>Loading private logo records…</p>:assets.length===0?
      <p>No private logo uploads yet.</p>:
      <ul aria-label="Society logo quarantine records">{assets.map(item=><li key={item.id}>
        <strong>PNG logo</strong> · {item.status} · {(item.contentLengthBytes/1024).toFixed(1)} KiB
        <span> · {new Date(item.createdAt).toLocaleDateString()}</span>
        {item.status==='VERIFIED'&&<span> · Safety verified</span>}
        {item.status==='PENDING'&&<button type="button" disabled={busy} onClick={()=>void cancelLogo(item)}>Cancel unused upload</button>}
        {item.status==='PENDING'&&<button type="button" disabled={busy}
          onClick={()=>void verifyLogo(item)}>Verify after link expiry</button>}
      </li>)}</ul>}
    <p className="brand-editor-help">
      Verified means approved for selection, not already published. Pending/rejected images are
      never shown to residents, guards or unauthenticated visitors.
    </p>
  </section>
}
