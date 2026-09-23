'use client'

import {FormEvent,useCallback,useEffect,useRef,useState} from 'react'
import {
  ActionBar,EmptyState,ErrorState,FormField,PageHeader,PageShell,PrimaryButton,
  SecondaryButton,SelectField,StatusPill,Timeline,
} from '../../components/admin-ui'
import { api, type Session } from '../../lib/admin-client'

type DocumentRow={id:string;title:string;description?:string|null;category:string;audience:string;status:string;fileName:string;mimeType:string;sizeBytes:number;version?:number;createdAt?:string;publishedAt?:string|null;unitId?:string|null;unitNumber?:string|null;buildingName?:string|null;supersedesDocumentId?:string|null;supersededByDocumentId?:string|null}
type UnitOption={id:string;number:string;building:{id:string;name:string;code:string}}
type DocumentEvent={id:string;eventType:string;fromStatus?:string|null;toStatus?:string|null;note?:string|null;actorName?:string|null;createdAt:string}
type UploadIntent={storageKey:string;uploadUrl:string;method:string;headers?:Record<string,string>;expiresAt?:string}
type DownloadIntent={downloadUrl?:string;url?:string;expiresAt?:string}

const readRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER','ACCOUNTANT','AUDITOR'])
const manageRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN'])
const categories=['BYLAW','POLICY','MEETING_MINUTES','CIRCULAR','COMPLIANCE','CONTRACT','AMC','FINANCE','PROPERTY','OTHER']
const audiences=['MANAGEMENT','ALL_MEMBERS','OWNERS_ONLY','PROPERTY_OWNER_ONLY']

function getSession():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw) as Session:null}catch{return null}}
const human=(v:string)=>v.replaceAll('_',' ')
const fmt=(v?:string|null)=>v?new Date(v).toLocaleString('en-IN'):'—'

export default function DocumentsPage(){
  const s=typeof window==='undefined'?null:getSession()
  const allowed=!!s&&readRoles.has(s.role)
  const canManage=!!s&&manageRoles.has(s.role)
  const[rows,setRows]=useState<DocumentRow[]>([])
  const[units,setUnits]=useState<UnitOption[]>([])
  const[history,setHistory]=useState<DocumentEvent[]>([])
  const[historyDocumentId,setHistoryDocumentId]=useState('')
  const[loading,setLoading]=useState(true)
  const[historyLoading,setHistoryLoading]=useState(false)
  const[busy,setBusy]=useState(false)
  const[error,setError]=useState('')
  const[success,setSuccess]=useState('')
  const[title,setTitle]=useState('')
  const[description,setDescription]=useState('')
  const[category,setCategory]=useState('POLICY')
  const[audience,setAudience]=useState('MANAGEMENT')
  const[unitId,setUnitId]=useState('')
  const[file,setFile]=useState<File|null>(null)
  const[replacementDocumentId,setReplacementDocumentId]=useState('')
  const[replacementFile,setReplacementFile]=useState<File|null>(null)
  const[replacementDescription,setReplacementDescription]=useState('')
  const historyRequest=useRef(0)

  const load=useCallback(async()=>{
    if(!s||!allowed)return
    setLoading(true);setError('')
    try{
      const[docs,ctx]=await Promise.all([
        api<DocumentRow[]>('/documents/management',{},s),
        api<UnitOption[]>('/documents/management/context',{},s),
      ])
      setRows(docs);setUnits(ctx)
      if(replacementDocumentId&&!docs.some(row=>row.id===replacementDocumentId&&row.status==='PUBLISHED'&&!row.supersededByDocumentId)){
        setReplacementDocumentId('');setReplacementFile(null);setReplacementDescription('')
      }
    }catch(e){setError(e instanceof Error?e.message:'Documents could not be loaded')}
    finally{setLoading(false)}
  },[s?.accessToken,allowed,replacementDocumentId])

  useEffect(()=>{void load()},[load])

  const run=async(fn:()=>Promise<void>,message:string)=>{
    setBusy(true);setError('');setSuccess('')
    try{await fn();setSuccess(message);await load()}
    catch(e){setError(e instanceof Error?e.message:'Document operation failed')}
    finally{setBusy(false)}
  }

  const upload=(e:FormEvent)=>{
    e.preventDefault()
    if(!s||!canManage||!file)return
    if(audience==='PROPERTY_OWNER_ONLY'&&!unitId){setError('Select the property for a property-owner-only document.');return}
    void run(async()=>{
      const intent=await api<UploadIntent>('/documents/management/upload-intent',{method:'POST',body:JSON.stringify({contentType:file.type,contentLengthBytes:file.size})},s)
      const put=await fetch(intent.uploadUrl,{method:intent.method||'PUT',headers:intent.headers??{'Content-Type':file.type},body:file})
      if(!put.ok)throw new Error(`Secure document upload failed (${put.status})`)
      await api('/documents/management',{method:'POST',body:JSON.stringify({
        category,audience,title:title.trim(),description:description.trim()||undefined,
        unitId:audience==='PROPERTY_OWNER_ONLY'?unitId:undefined,storageKey:intent.storageKey,
        fileName:file.name,mimeType:file.type,sizeBytes:file.size,
      })},s)
      setTitle('');setDescription('');setUnitId('');setFile(null)
    },'Document uploaded as a draft after server verification and safety scanning.')
  }

  const mutate=(id:string,action:'publish'|'archive')=>{
    if(!s||!canManage)return
    void run(()=>api(`/documents/management/${id}/${action}`,{method:'PATCH',body:'{}'},s).then(()=>undefined),`Document ${action} recorded.`)
  }

  const download=async(id:string)=>{
    if(!s)return
    setError('')
    try{
      const intent=await api<DownloadIntent>(`/documents/management/${id}/download-intent`,{},s)
      const url=intent.downloadUrl??intent.url
      if(!url)throw new Error('Download intent did not include a URL')
      window.open(url,'_blank','noopener,noreferrer')
    }catch(e){setError(e instanceof Error?e.message:'Download could not be started')}
  }

  const openHistory=async(id:string)=>{
    if(!s)return
    const requestId=++historyRequest.current
    setHistoryDocumentId(id);setHistory([]);setHistoryLoading(true);setError('')
    try{
      const next=await api<DocumentEvent[]>(`/documents/management/${id}/history`,{},s)
      if(requestId===historyRequest.current)setHistory(next)
    }catch(e){
      if(requestId===historyRequest.current)setError(e instanceof Error?e.message:'Document history could not be loaded')
    }finally{
      if(requestId===historyRequest.current)setHistoryLoading(false)
    }
  }

  const closeHistory=()=>{
    historyRequest.current++
    setHistoryDocumentId('');setHistory([]);setHistoryLoading(false)
  }

  const replaceVersion=(e:FormEvent)=>{
    e.preventDefault()
    if(!s||!canManage||!replacementDocumentId||!replacementFile)return
    void run(async()=>{
      const intent=await api<UploadIntent>('/documents/management/upload-intent',{method:'POST',body:JSON.stringify({contentType:replacementFile.type,contentLengthBytes:replacementFile.size})},s)
      const put=await fetch(intent.uploadUrl,{method:intent.method||'PUT',headers:intent.headers??{'Content-Type':replacementFile.type},body:replacementFile})
      if(!put.ok)throw new Error(`Secure replacement upload failed (${put.status})`)
      await api(`/documents/management/${replacementDocumentId}/replacement`,{method:'POST',body:JSON.stringify({
        storageKey:intent.storageKey,fileName:replacementFile.name,mimeType:replacementFile.type,
        sizeBytes:replacementFile.size,description:replacementDescription.trim()||undefined,
      })},s)
      setReplacementDocumentId('');setReplacementFile(null);setReplacementDescription('')
    },'Replacement draft created. Publish it to atomically archive the prior version.')
  }

  if(!s||!allowed)return <PageShell><PageHeader title="Document repository access required" actions={<a href={s?.role==='AUDITOR'?'/audit':'/'}>Return</a>}/></PageShell>

  return <PageShell>
    <PageHeader
      context={`${s.societyName??'Current society'} · ${human(s.role)}`}
      title="Society document repository"
      description={canManage?'Upload, publish, archive and review society-controlled documents.':'Read-only society document evidence.'}
      actions={<a href={s.role==='AUDITOR'?'/audit':'/'}>← Back</a>}
    />
    {error&&<ErrorState title="Document operation failed" description={error}/>}
    <ActionBar feedback={success} label="Document repository actions">
      <SecondaryButton loading={loading} disabled={busy} onClick={()=>void load()}>Refresh repository</SecondaryButton>
    </ActionBar>

    {canManage&&<form onSubmit={upload} style={panel}>
      <h2>Upload draft</h2>
      <div style={grid}>
        <FormField label="Title" value={title} onChange={e=>setTitle(e.target.value)} required maxLength={180}/>
        <SelectField label="Category" value={category} onChange={e=>setCategory(e.target.value)}>
          {categories.map(v=><option key={v}>{v}</option>)}
        </SelectField>
        <SelectField label="Audience" value={audience} onChange={e=>{setAudience(e.target.value);if(e.target.value!=='PROPERTY_OWNER_ONLY')setUnitId('')}}>
          {audiences.map(v=><option key={v}>{v}</option>)}
        </SelectField>
        {audience==='PROPERTY_OWNER_ONLY'&&<SelectField label="Property" value={unitId} onChange={e=>setUnitId(e.target.value)} required>
          <option value="">Select property</option>{units.map(u=><option key={u.id} value={u.id}>{u.building.name} · {u.number}</option>)}
        </SelectField>}
        <FormField label="File" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0]??null)} required/>
      </div>
      <FormField label="Description" multiline value={description} onChange={e=>setDescription(e.target.value)} maxLength={2000}/>
      <ActionBar feedback={success}><PrimaryButton type="submit" loading={busy} disabled={!file}>Upload securely</PrimaryButton></ActionBar>
      <p style={muted}>PDF/JPEG/PNG/WebP, maximum 5 MB. The API validates society scope, object metadata and safety scan before creating the draft.</p>
    </form>}

    <section style={panel} aria-labelledby="management-repository-heading">
      <h2 id="management-repository-heading">Management repository</h2>
      {loading?<p>Loading documents…</p>:rows.length===0?<EmptyState title="No documents" description="No society-controlled documents are available in this workspace."/>:<div style={list}>
        {rows.map(d=>{
          const replacementPending=d.status==='PUBLISHED'&&rows.some(candidate=>candidate.supersedesDocumentId===d.id&&candidate.status!=='ARCHIVED')
          return <article key={d.id} style={row}>
            <div style={documentMeta}>
              <div style={statusRow}>
                <strong>{d.title}</strong>
                <StatusPill label={human(d.status)} tone={d.status==='PUBLISHED'?'success':d.status==='ARCHIVED'?'neutral':'info'}/>
                <StatusPill label={human(d.category)} tone="neutral"/>
                {replacementPending&&<StatusPill label="Replacement pending" tone="warning"/>}
              </div>
              <span>{human(d.audience)}</span>
              <small>{d.fileName} · {(d.sizeBytes/1024).toFixed(0)} KB{d.version?` · v${d.version}`:''}{d.unitNumber?` · ${d.buildingName??'Property'} ${d.unitNumber}`:''}{d.supersedesDocumentId?' · replacement draft':''}{d.supersededByDocumentId?' · superseded':''}</small>
              {d.description&&<p>{d.description}</p>}
            </div>
            <div style={actions}>
              <SecondaryButton disabled={busy} onClick={()=>void openHistory(d.id)}>History</SecondaryButton>
              <SecondaryButton onClick={()=>void download(d.id)}>Download</SecondaryButton>
              {canManage&&d.status==='PUBLISHED'&&!d.supersededByDocumentId&&!replacementPending&&<SecondaryButton disabled={busy} onClick={()=>{setReplacementDocumentId(d.id);setReplacementDescription(d.description??'')}}>Replace version</SecondaryButton>}
              {canManage&&d.status==='DRAFT'&&<PrimaryButton disabled={busy} onClick={()=>mutate(d.id,'publish')}>Publish</PrimaryButton>}
              {canManage&&d.status!=='ARCHIVED'&&<SecondaryButton disabled={busy} onClick={()=>mutate(d.id,'archive')}>Archive</SecondaryButton>}
            </div>
          </article>
        })}
      </div>}
    </section>

    {replacementDocumentId&&canManage&&<form onSubmit={replaceVersion} style={panel}>
      <div style={sectionHeader}><div>
        <h2>Replace published version</h2>
        <p style={muted}>Creates a new draft. The current published document stays live until the replacement draft is explicitly published.</p>
      </div><SecondaryButton type="button" onClick={()=>{setReplacementDocumentId('');setReplacementFile(null);setReplacementDescription('')}}>Cancel</SecondaryButton></div>
      <FormField label="Replacement file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setReplacementFile(e.target.files?.[0]??null)} required/>
      <FormField label="Version note" multiline value={replacementDescription} onChange={e=>setReplacementDescription(e.target.value)} maxLength={2000}/>
      <ActionBar feedback={success}><PrimaryButton type="submit" loading={busy} disabled={!replacementFile}>Create replacement draft</PrimaryButton></ActionBar>
      <p style={muted}>Publishing the replacement will atomically archive the prior published version and retain both records with append-only version evidence.</p>
    </form>}

    {historyDocumentId&&<section style={panel} aria-labelledby="document-history-heading">
      <div style={sectionHeader}><div>
        <h2 id="document-history-heading">Document history</h2>
        <p style={muted}>Append-only lifecycle evidence for the selected document.</p>
      </div><SecondaryButton onClick={closeHistory}>Close</SecondaryButton></div>
      {historyLoading?<p>Loading document history…</p>:<Timeline
        label="Document history"
        emptyLabel="No history events."
        events={history.map(e=>({
          id:e.id,label:human(e.eventType),actor:e.actorName??'Recorded actor',
          dateTime:e.createdAt,timeLabel:fmt(e.createdAt),
          evidence:<>{(e.fromStatus||e.toStatus)&&<div>{e.fromStatus?`${e.fromStatus} → `:''}{e.toStatus??''}</div>}{e.note&&<div>{e.note}</div>}</>,
        }))}
      />}
    </section>}
  </PageShell>
}

const panel:React.CSSProperties={display:'grid',gap:14,padding:20,border:'1px solid var(--line, #d5e8eb)',borderRadius:16,background:'var(--surface, #fff)'}
const grid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,220px),1fr))',gap:12}
const list:React.CSSProperties={display:'grid',gap:10}
const row:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:14,alignItems:'center',padding:14,border:'1px solid var(--line, #d5e8eb)',borderRadius:12,flexWrap:'wrap',minWidth:0}
const documentMeta:React.CSSProperties={display:'grid',gap:6,flex:'1 1 520px',minWidth:0}
const statusRow:React.CSSProperties={display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}
const actions:React.CSSProperties={display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}
const sectionHeader:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start',flexWrap:'wrap'}
const muted:React.CSSProperties={color:'var(--muted, #64748b)',fontSize:13,margin:0}
