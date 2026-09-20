'use client'

import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { ActionBar, DetailPanel, ErrorState, FormField, PrimaryButton, SecondaryButton, StatusPill } from '../../components/admin-ui'
import { parseXlsx } from './xlsx'
import type { SpreadsheetRow } from './xlsx'

export type MigrationSession={accessToken:string;role:string;societyName?:string}
type Entity='BUILDING'|'UNIT'|'RESIDENT'|'VEHICLE'|'PARKING'|'WORKFORCE'|'VENDOR'|'OPENING_BALANCE'
type Issue={row:number;field?:string;code:string;message:string}
type Preview={entityType:Entity;totalRows:number;validRows:number;invalidRows:number;duplicateRows:number;normalizedRows:Record<string,string>[];issues:Issue[]}
type Batch={id:string;status:string;entityType:string;checksum:string;idempotentReplay?:boolean}

const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
const entities:Entity[]=['BUILDING','UNIT','RESIDENT','VEHICLE','PARKING','WORKFORCE','VENDOR','OPENING_BALANCE']
async function api<T>(s:MigrationSession,path:string,init:RequestInit={}):Promise<T>{const r=await fetch(base+'/api/v1'+path,{...init,headers:{'Content-Type':'application/json',Authorization:'Bearer '+s.accessToken,...init.headers}});const text=await r.text();const body=text?JSON.parse(text):null;if(!r.ok)throw new Error(Array.isArray(body?.message)?body.message.join(', '):body?.message??('Request failed ('+r.status+')'));return body as T}

function parseCsv(text:string){
  const rows:string[][]=[];let row:string[]=[];let field='';let quoted=false
  for(let i=0;i<text.length;i++){const ch=text[i],next=text[i+1]
    if(ch==='"'&&quoted&&next==='"'){field+='"';i++;continue}
    if(ch==='"'){quoted=!quoted;continue}
    if(ch===','&&!quoted){row.push(field);field='';continue}
    if(((ch.charCodeAt(0)===10)||(ch.charCodeAt(0)===13))&&!quoted){if(ch.charCodeAt(0)===13&&next?.charCodeAt(0)===10)i++;row.push(field);field='';if(row.some(v=>v.trim()!==''))rows.push(row);row=[];continue}
    field+=ch
  }
  row.push(field);if(row.some(v=>v.trim()!==''))rows.push(row)
  if(quoted)throw new Error('CSV contains an unclosed quoted field.')
  if(rows.length<2)throw new Error('CSV must contain a header row and at least one data row.')
  const headers=rows[0].map(v=>v.trim())
  if(headers.some(v=>!v))throw new Error('CSV contains an empty column header.')
  return rows.slice(1).map(values=>Object.fromEntries(headers.map((header,index)=>[header,values[index]??'']))).map((item,index)=>({...item,__source_row:String(index+2)}))
}

export function MigrationImportStager({session,onBatchCreated}:{session:MigrationSession;onBatchCreated:()=>void}){
  const[entity,setEntity]=useState<Entity>('BUILDING'),[sourceLabel,setSourceLabel]=useState(''),[csv,setCsv]=useState(''),[fileRows,setFileRows]=useState<SpreadsheetRow[]|null>(null),[preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[feedback,setFeedback]=useState('')

  const canPersist=!!preview&&preview.invalidRows===0&&preview.totalRows>0
  const hasSource=(fileRows?.length??0)>0||!!csv.trim()
  function currentRows(){return fileRows??parseCsv(csv)}

  async function previewRows(){setBusy(true);setError('');setFeedback('');try{const parsed=currentRows();const result=await api<Preview>(session,'/migration/preview',{method:'POST',body:JSON.stringify({entityType:entity,rows:parsed})});setPreview(result);setFeedback(result.invalidRows===0?'Preview is clean and ready for a dry-run batch.':'Preview completed with row-level issues.')}catch(e){setPreview(null);setError(e instanceof Error?e.message:'Migration preview failed')}finally{setBusy(false)}}
  async function createBatch(){if(!canPersist)return;setBusy(true);setError('');setFeedback('');try{const parsed=currentRows();const batch=await api<Batch>(session,'/migration/batches',{method:'POST',body:JSON.stringify({entityType:entity,rows:parsed,sourceLabel:sourceLabel.trim()||undefined})});setFeedback(batch.idempotentReplay?'Matching dry-run batch already exists; reused safely.':'Dry-run migration batch created.');onBatchCreated()}catch(e){setError(e instanceof Error?e.message:'Dry-run batch could not be created')}finally{setBusy(false)}}
  async function chooseFile(event:ChangeEvent<HTMLInputElement>){const file=event.target.files?.[0];if(!file)return;setBusy(true);setError('');setFeedback('');setPreview(null);try{const name=file.name.toLowerCase();setSourceLabel(file.name);if(name.endsWith('.csv')){setFileRows(null);setCsv(await file.text());setFeedback('CSV loaded. Preview validation before creating a dry-run batch.');return}if(name.endsWith('.xlsx')){const rows=await parseXlsx(file);setFileRows(rows);setCsv('');setFeedback(`XLSX loaded from the first worksheet: ${rows.length} data rows. Preview validation before creating a dry-run batch.`);return}throw new Error('Choose a UTF-8 CSV or XLSX file.')}catch(e){setFileRows(null);setCsv('');setError(e instanceof Error?e.message:'Spreadsheet could not be read');event.target.value=''}finally{setBusy(false)}}

  return <DetailPanel title="Stage import data">
    <p>Use canonical spreadsheet columns, preview row-level validation first, then persist a dry-run batch. Preview never mutates operational society data.</p>
    <div style={{display:'grid',gap:14}}>
      <label>Entity type<select value={entity} onChange={e=>{setEntity(e.target.value as Entity);setPreview(null)}} style={{display:'block',width:'100%',marginTop:6,padding:10,border:'1px solid #cbd5e1',borderRadius:10}}>{entities.map(item=><option key={item} value={item}>{item.replaceAll('_',' ')}</option>)}</select></label>
      <FormField label="Source label" value={sourceLabel} onChange={e=>setSourceLabel(e.target.value)} maxLength={160} hint="Example: Legacy residents export - Tower A"/>
      <label>CSV or XLSX file<input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=>void chooseFile(e)} style={{display:'block',marginTop:6}}/></label>
      <FormField multiline label="CSV data" value={csv} onChange={e=>{setCsv(e.target.value);setFileRows(null);setPreview(null)}} rows={10} hint="Paste UTF-8 CSV here, or upload CSV/XLSX above. XLSX reads the first worksheet."/>
      <ActionBar feedback={feedback}>
        <SecondaryButton onClick={()=>void previewRows()} loading={busy} disabled={!hasSource}>Preview validation</SecondaryButton>
        <PrimaryButton onClick={()=>void createBatch()} loading={busy} disabled={!canPersist}>Create dry-run batch</PrimaryButton>
      </ActionBar>
      {error&&<ErrorState title="Import staging needs attention" description={error}/>}
      {preview&&<section aria-label="Migration preview result" style={{display:'grid',gap:10}}>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><StatusPill label={preview.invalidRows===0?'READY':'NEEDS ATTENTION'} tone={preview.invalidRows===0?'success':'warning'}/><span>{preview.validRows}/{preview.totalRows} valid · {preview.duplicateRows} duplicates</span></div>
        {preview.issues.length>0&&<div style={{display:'grid',gap:8}}>{preview.issues.slice(0,100).map((issue,index)=><article key={index} style={{border:'1px solid #e5e7eb',borderRadius:10,padding:10}}><strong>Row {issue.row}{issue.field?' · '+issue.field:''}</strong><div>{issue.code.replaceAll('_',' ')} · {issue.message}</div></article>)}</div>}
        {preview.issues.length>100&&<small>Showing first 100 of {preview.issues.length} issues.</small>}
      </section>}
      <small>XLSX is parsed locally in the browser and only canonical row data is sent to the existing migration preview API. The first worksheet is used; preview remains non-mutating.</small>
    </div>
  </DetailPanel>
}
