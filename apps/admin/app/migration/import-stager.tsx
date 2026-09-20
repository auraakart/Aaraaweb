'use client'

import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { ActionBar, DetailPanel, ErrorState, FormField, PrimaryButton, SecondaryButton, StatusPill } from '../../components/admin-ui'

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
    if((ch==='
'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='
')i++;row.push(field);field='';if(row.some(v=>v.trim()!==''))rows.push(row);row=[];continue}
    field+=ch
  }
  row.push(field);if(row.some(v=>v.trim()!==''))rows.push(row)
  if(quoted)throw new Error('CSV contains an unclosed quoted field.')
  if(rows.length<2)throw new Error('CSV must contain a header row and at least one data row.')
  const headers=rows[0].map(v=>v.trim())
  if(headers.some(v=>!v))throw new Error('CSV contains an empty column header.')
  return rows.slice(1).map((values,rowIndex)=>Object.fromEntries(headers.map((header,index)=>[header,values[index]??'']))).map((item,index)=>({...item,__source_row:String(index+2)}))
}

export function MigrationImportStager({session,onBatchCreated}:{session:MigrationSession;onBatchCreated:()=>void}){
  const[entity,setEntity]=useState<Entity>('BUILDING'),[sourceLabel,setSourceLabel]=useState(''),[csv,setCsv]=useState(''),[preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[feedback,setFeedback]=useState('')

  const canPersist=!!preview&&preview.invalidRows===0&&preview.totalRows>0

  async function previewRows(){setBusy(true);setError('');setFeedback('');try{const parsed=parseCsv(csv);const result=await api<Preview>(session,'/migration/preview',{method:'POST',body:JSON.stringify({entityType:entity,rows:parsed})});setPreview(result);setFeedback(result.invalidRows===0?'Preview is clean and ready for a dry-run batch.':'Preview completed with row-level issues.')}catch(e){setPreview(null);setError(e instanceof Error?e.message:'Migration preview failed')}finally{setBusy(false)}}
  async function createBatch(){if(!canPersist)return;setBusy(true);setError('');setFeedback('');try{const parsed=parseCsv(csv);const batch=await api<Batch>(session,'/migration/batches',{method:'POST',body:JSON.stringify({entityType:entity,rows:parsed,sourceLabel:sourceLabel.trim()||undefined})});setFeedback(batch.idempotentReplay?'Matching dry-run batch already exists; reused safely.':'Dry-run migration batch created.');onBatchCreated()}catch(e){setError(e instanceof Error?e.message:'Dry-run batch could not be created')}finally{setBusy(false)}}
  async function chooseFile(event:ChangeEvent<HTMLInputElement>){const file=event.target.files?.[0];if(!file)return;if(!file.name.toLowerCase().endsWith('.csv')){setError('Direct XLSX upload is not enabled yet. Export the worksheet as UTF-8 CSV; the canonical columns remain spreadsheet-compatible.');event.target.value='';return}setError('');setSourceLabel(file.name);setCsv(await file.text());setPreview(null)}

  return <DetailPanel title="Stage import data">
    <p>Use canonical spreadsheet columns, preview row-level validation first, then persist a dry-run batch. Preview never mutates operational society data.</p>
    <div style={{display:'grid',gap:14}}>
      <label>Entity type<select value={entity} onChange={e=>{setEntity(e.target.value as Entity);setPreview(null)}} style={{display:'block',width:'100%',marginTop:6,padding:10,border:'1px solid #cbd5e1',borderRadius:10}}>{entities.map(item=><option key={item} value={item}>{item.replaceAll('_',' ')}</option>)}</select></label>
      <FormField label="Source label" value={sourceLabel} onChange={e=>setSourceLabel(e.target.value)} maxLength={160} hint="Example: Legacy residents export - Tower A"/>
      <label>CSV file<input type="file" accept=".csv,text/csv" onChange={e=>void chooseFile(e)} style={{display:'block',marginTop:6}}/></label>
      <FormField multiline label="CSV data" value={csv} onChange={e=>{setCsv(e.target.value);setPreview(null)}} rows={10} hint="UTF-8 CSV with one header row. Quoted commas, quotes and line breaks are supported."/>
      <ActionBar feedback={feedback}>
        <SecondaryButton onClick={()=>void previewRows()} loading={busy} disabled={!csv.trim()}>Preview validation</SecondaryButton>
        <PrimaryButton onClick={()=>void createBatch()} loading={busy} disabled={!canPersist}>Create dry-run batch</PrimaryButton>
      </ActionBar>
      {error&&<ErrorState title="Import staging needs attention" description={error}/>}
      {preview&&<section aria-label="Migration preview result" style={{display:'grid',gap:10}}>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><StatusPill label={preview.invalidRows===0?'READY':'NEEDS ATTENTION'} tone={preview.invalidRows===0?'success':'warning'}/><span>{preview.validRows}/{preview.totalRows} valid · {preview.duplicateRows} duplicates</span></div>
        {preview.issues.length>0&&<div style={{display:'grid',gap:8}}>{preview.issues.slice(0,100).map((issue,index)=><article key={index} style={{border:'1px solid #e5e7eb',borderRadius:10,padding:10}}><strong>Row {issue.row}{issue.field?' · '+issue.field:''}</strong><div>{issue.code.replaceAll('_',' ')} · {issue.message}</div></article>)}</div>}
        {preview.issues.length>100&&<small>Showing first 100 of {preview.issues.length} issues.</small>}
      </section>}
      <small>Binary XLSX ingestion is intentionally not claimed in this slice. Exporting an XLSX worksheet to CSV preserves the canonical import contract; direct XLSX handling remains a separate V4.27 item.</small>
    </div>
  </DetailPanel>
}
