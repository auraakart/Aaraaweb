'use client'

import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { ActionBar, DetailPanel, ErrorState, FormField, PrimaryButton, SecondaryButton, StatusPill } from '../../components/admin-ui'
import { api, type Session } from '../../lib/admin-client'
import { currentAdminSession, sameAdminContext } from '../../lib/admin-session-context'
import { parseMigrationCsv as parseCsv } from '../../lib/migration-csv'
import { parseXlsx } from './xlsx'
import type { SpreadsheetRow } from './xlsx'
import {readMigrationPreview,readMigrationBatch,type MigrationEntity,type MigrationPreview} from '../../lib/adoption-response'

export type MigrationSession=Session
type Entity=MigrationEntity
type Preview=MigrationPreview&{sourceRows:string[]}

const entities:Entity[]=['BUILDING','UNIT','RESIDENT','VEHICLE','PARKING','WORKFORCE','VENDOR','OPENING_BALANCE']

export function MigrationImportStager({session,onBatchCreated}:{session:MigrationSession;onBatchCreated:()=>void}){
  const[entity,setEntity]=useState<Entity>('BUILDING'),[sourceLabel,setSourceLabel]=useState(''),[csv,setCsv]=useState(''),[fileRows,setFileRows]=useState<SpreadsheetRow[]|null>(null),[preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[feedback,setFeedback]=useState('')

  const canPersist=!!preview&&preview.invalidRows===0&&preview.totalRows>0
  const hasSource=(fileRows?.length??0)>0||!!csv.trim()
  function currentRows(){return fileRows??parseCsv(csv)}

  const epoch=useRef(0),inFlight=useRef(false),latestSession=useRef(session)
  const fileInput=useRef<HTMLInputElement>(null)
  latestSession.current=session
  useEffect(()=>{
    const context=latestSession.current
    const clear=()=>{
      epoch.current++;inFlight.current=false
      setPreview(null);setCsv('');setFileRows(null);setSourceLabel('');setFeedback('');setError('');setBusy(false)
      if(fileInput.current)fileInput.current.value=''
    }
    clear()
    const changed=()=>{if(!sameAdminContext(context,currentAdminSession())){clear();setError('Sign-in or society changed. Reopen Migration from the Admin console.')}}
    window.addEventListener('storage',changed);window.addEventListener('focus',changed)
    return()=>{epoch.current++;inFlight.current=false;window.removeEventListener('storage',changed);window.removeEventListener('focus',changed)}
  },[session.sessionId,session.societyId,session.role,session.audience])
  const contextCurrent=()=>sameAdminContext(session,latestSession.current)&&sameAdminContext(session,currentAdminSession())
  function begin():number|null{
    if(inFlight.current)return null
    if(!contextCurrent()){setPreview(null);setError('Sign-in or society changed. Reopen Migration from the Admin console.');return null}
    inFlight.current=true;const request=++epoch.current
    setBusy(true);setError('');setFeedback('');setPreview(null)
    return request
  }
  const current=(request:number)=>request===epoch.current&&contextCurrent()
  function finish(request:number){
    if(request!==epoch.current)return
    inFlight.current=false;setBusy(false)
    if(!contextCurrent()){setPreview(null);setError('Sign-in or society changed. Reopen Migration from the Admin console.')}
  }
  async function previewRows(){
    const request=begin();if(request===null)return
    try{const parsed=currentRows();const raw=await api<unknown>('/migration/preview',{method:'POST',body:JSON.stringify({entityType:entity,rows:parsed})},session)
      if(!current(request))return
      const result=readMigrationPreview(raw,entity,parsed.length)
      setPreview({...result,sourceRows:parsed.map(row=>row.__source_row)});setFeedback(result.invalidRows===0?'Preview is clean and ready for a dry-run batch.':'Preview completed with row-level issues.')
    }catch(e){if(current(request))setError(e instanceof Error?e.message:'Migration preview failed')}finally{finish(request)}
  }
  async function createBatch(){
    if(!canPersist)return
    const request=begin();if(request===null)return
    try{const parsed=currentRows();const raw=await api<unknown>('/migration/batches',{method:'POST',body:JSON.stringify({entityType:entity,rows:parsed,sourceLabel:sourceLabel.trim()||undefined})},session)
      if(!current(request))return
      const batch=readMigrationBatch(raw,entity)
      setFeedback(batch.idempotentReplay?`Matching batch found (${batch.status.replaceAll('_',' ')}). Review its recorded state before continuing.`:'Dry-run migration batch created.');onBatchCreated()
    }catch(e){if(current(request))setError(e instanceof Error?e.message:'Dry-run batch could not be created')}finally{finish(request)}
  }
  async function chooseFile(event:ChangeEvent<HTMLInputElement>){
    const input=event.target,file=input.files?.[0];if(!file)return
    const request=begin();if(request===null)return
    try{
      if(file.size>10*1024*1024)throw new Error('Choose a CSV or XLSX file no larger than 10 MB.')
      const name=file.name.toLowerCase()
      if(name.endsWith('.csv')){const text=await file.text();if(!current(request))return;setSourceLabel(file.name);setFileRows(null);setCsv(text);setFeedback('CSV loaded. Preview validation before creating a dry-run batch.');return}
      if(name.endsWith('.xlsx')){const rows=await parseXlsx(file);if(!current(request))return;setSourceLabel(file.name);setFileRows(rows);setCsv('');setFeedback(`XLSX loaded from the first worksheet: ${rows.length} data rows. Preview validation before creating a dry-run batch.`);return}
      throw new Error('Choose a UTF-8 CSV or XLSX file.')
    }catch(e){if(current(request)){setFileRows(null);setCsv('');setError(e instanceof Error?e.message:'Spreadsheet could not be read');input.value=''}}finally{finish(request)}
  }

  return <DetailPanel title="Stage import data">
    <p>Use canonical spreadsheet columns, preview row-level validation first, then persist a dry-run batch. Preview never mutates operational society data.</p>
    <div style={{display:'grid',gap:14}}>
      <label>Entity type<select disabled={busy} value={entity} onChange={e=>{setEntity(e.target.value as Entity);setPreview(null)}} style={{display:'block',width:'100%',marginTop:6,padding:10,border:'1px solid #cbd5e1',borderRadius:10}}>{entities.map(item=><option key={item} value={item}>{item.replaceAll('_',' ')}</option>)}</select></label>
      <FormField disabled={busy} label="Source label" value={sourceLabel} onChange={e=>setSourceLabel(e.target.value)} maxLength={160} hint="Example: Legacy residents export - Tower A"/>
      <label>CSV or XLSX file<input ref={fileInput} disabled={busy} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=>void chooseFile(e)} style={{display:'block',marginTop:6}}/></label>
      <FormField disabled={busy} multiline label="CSV data" value={csv} onChange={e=>{setCsv(e.target.value);setFileRows(null);setPreview(null)}} rows={10} hint="Paste UTF-8 CSV here, or upload CSV/XLSX above. XLSX reads the first worksheet."/>
      <ActionBar feedback={feedback}>
        <SecondaryButton onClick={()=>void previewRows()} loading={busy} disabled={!hasSource}>Preview validation</SecondaryButton>
        <PrimaryButton onClick={()=>void createBatch()} loading={busy} disabled={!canPersist}>Create dry-run batch</PrimaryButton>
      </ActionBar>
      {error&&<ErrorState title="Import staging needs attention" description={error}/>}
      {preview&&<section aria-label="Migration preview result" style={{display:'grid',gap:10}}>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><StatusPill label={preview.invalidRows===0?'READY':'NEEDS ATTENTION'} tone={preview.invalidRows===0?'success':'warning'}/><span>{preview.validRows}/{preview.totalRows} valid · {preview.duplicateRows} duplicates</span></div>
        {preview.issues.length>0&&<div style={{display:'grid',gap:8}}>{preview.issues.slice(0,100).map((issue,index)=><article key={index} style={{border:'1px solid #e5e7eb',borderRadius:10,padding:10}}><strong>Source row {preview.sourceRows[issue.row-1]}{issue.field?' · '+issue.field:''}</strong><div>{issue.code.replaceAll('_',' ')} · {issue.message}</div></article>)}</div>}
        {preview.issues.length>100&&<small>Showing first 100 of {preview.issues.length} issues.</small>}
      </section>}
      <small>XLSX is parsed locally in the browser and only canonical row data is sent to the existing migration preview API. The first worksheet is used; preview remains non-mutating. Use values only; convert formulas to values and correct ambiguous columns before preview.</small>
    </div>
  </DetailPanel>
}
