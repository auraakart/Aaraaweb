'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { MigrationImportStager } from './import-stager'
import { api, type Session } from '../../lib/admin-client'

type Batch={id:string;entityType:string;sourceLabel?:string|null;status:string;checksum:string;totalRows:number;validRows:number;invalidRows:number;duplicateRows:number;referentialIssueCount:number;createdAt:string;updatedAt:string}
type BatchDetail=Batch&{
  rows:Array<{rowNumber:number;valid:boolean;identityKey?:string|null;targetType?:string|null;targetId?:string|null}>
  financeReconciliation?:{status?:string;debitPaise?:number;creditPaise?:number;balanced?:boolean}|null
}

function getSession():Session|null{
  try{
    const raw=sessionStorage.getItem('aaraagate.admin.session')
    return raw?JSON.parse(raw) as Session:null
  }catch{return null}
}
const migrationStages=[
  {entity:'BUILDING',label:'1. Buildings',description:'Import the society structure first.'},
  {entity:'UNIT',label:'2. Units',description:'Units depend on committed buildings.'},
  {entity:'RESIDENT',label:'3. Residents',description:'Residents depend on committed units.'},
  {entity:'VEHICLE',label:'4. Vehicles',description:'Vehicle ownership depends on residents and units.'},
  {entity:'PARKING',label:'5. Parking',description:'Parking assignments depend on units and vehicles.'},
  {entity:'WORKFORCE',label:'6. Workforce',description:'Import staff and domestic-help identities.'},
  {entity:'VENDOR',label:'7. Vendors',description:'Import operational vendors before launch.'},
  {entity:'OPENING_BALANCE',label:'8. Opening balances',description:'Reconcile finance only after society structure is stable.'},
] as const

export default function MigrationPage(){
  const[session,setSession]=useState<Session|null>(null)
  const[rows,setRows]=useState<Batch[]>([])
  const[detail,setDetail]=useState<BatchDetail|null>(null)
  const[loading,setLoading]=useState(true)
  const[busy,setBusy]=useState(false)
  const[error,setError]=useState('')
  const[pendingAction,setPendingAction]=useState<'commit'|'rollback'|null>(null)

  const allowed=(s:Session|null)=>!!s&&['SUPER_ADMIN','SOCIETY_ADMIN'].includes(s.role)

  const load=useCallback(async(s:Session)=>{
    setLoading(true)
    setError('')
    try{setRows(await api<Batch[]>('/migration/batches',{},s))}
    catch(e){setError(e instanceof Error?e.message:'Could not load migration batches')}
    finally{setLoading(false)}
  },[])

  useEffect(()=>{
    const s=getSession()
    setSession(s)
    if(s&&allowed(s))void load(s)
    else setLoading(false)
  },[load])

  const inspect=async(batch:Batch)=>{
    if(!session)return
    setBusy(true)
    setError('')
    setPendingAction(null)
    try{setDetail(await api<BatchDetail>('/migration/batches/'+batch.id,{},session))}
    catch(e){setError(e instanceof Error?e.message:'Could not load migration evidence')}
    finally{setBusy(false)}
  }

  const mutate=async(action:'commit'|'rollback')=>{
    if(!session||!detail)return
    setBusy(true)
    setError('')
    try{
      await api('/migration/batches/'+detail.id+'/'+action,{method:'POST',body:'{}'},session)
      setPendingAction(null)
      setDetail(await api<BatchDetail>('/migration/batches/'+detail.id,{},session))
      setRows(await api<Batch[]>('/migration/batches',{},session))
    }catch(e){
      setError(e instanceof Error?e.message:'Migration action failed')
    }finally{
      setBusy(false)
    }
  }

  const download=async()=>{
    if(!session||!detail)return
    setBusy(true)
    setError('')
    try{
      const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
      const r=await fetch(base+'/api/v1/migration/batches/'+detail.id+'/evidence.csv',{headers:{Authorization:'Bearer '+session.accessToken}})
      if(!r.ok)throw new Error('Evidence export failed ('+r.status+')')
      const blob=await r.blob()
      const url=URL.createObjectURL(blob)
      const a=document.createElement('a')
      a.href=url
      a.download='migration-'+detail.id+'.csv'
      a.click()
      URL.revokeObjectURL(url)
    }catch(e){
      setError(e instanceof Error?e.message:'Evidence export failed')
    }finally{
      setBusy(false)
    }
  }

  const progress=useMemo(()=>{
    let previousCommitted=true
    return migrationStages.map(stage=>{
      const batches=rows.filter(row=>row.entityType===stage.entity)
      const committed=batches.some(row=>row.status==='COMMITTED')
      const ready=batches.some(row=>row.status==='READY')
      const blocked=!previousCommitted&&stage.entity!=='BUILDING'
      const status=committed?'Committed':ready?(blocked?'Blocked':'Ready'):'Pending'
      const result={...stage,status,committed,ready,blocked}
      previousCommitted=previousCommitted&&committed
      return result
    })
  },[rows])

  const committedStages=progress.filter(item=>item.committed).length
  const nextStage=progress.find(item=>!item.committed)
  const onboardingComplete=committedStages===progress.length

  const blockers=useMemo(()=>{
    if(!detail)return[] as string[]
    const items:string[]=[]
    if(detail.invalidRows>0)items.push(`${detail.invalidRows} invalid rows remain`)
    if(detail.duplicateRows>0)items.push(`${detail.duplicateRows} duplicate rows remain`)
    if(detail.referentialIssueCount>0)items.push(`${detail.referentialIssueCount} reference issues remain`)
    if(detail.financeReconciliation&&detail.financeReconciliation.balanced===false){
      items.push('Opening-balance finance reconciliation is not balanced')
    }
    return items
  },[detail])

  const cutoverReady=!!detail&&detail.status==='READY'&&blockers.length===0

  if(loading)return <main style={{padding:32}}>Loading migration center…</main>
  if(!allowed(session))return <main style={{padding:32}}><h1>Society administration required</h1><a href="/">Return to Admin</a></main>

  return (
    <main style={{maxWidth:1180,margin:'0 auto',padding:'28px 22px 80px'}}>
      <header style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap'}}>
        <div>
          <small>{session?.societyName??'Current society'}</small>
          <h1 style={{margin:'4px 0'}}>Migration center</h1>
          <p style={{margin:0}}>Validate, commit, rollback and retain evidence for society onboarding.</p>
        </div>
        <a href="/">← Admin console</a>
      </header>

      {error&&<div style={errorBox}>{error}</div>}

      <MigrationImportStager session={session!} onBatchCreated={()=>void load(session!)}/>

      <section style={panel} aria-label="Migration onboarding readiness">
        <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'start',flexWrap:'wrap'}}>
          <div>
            <h2 style={{margin:'0 0 4px'}}>Onboarding readiness</h2>
            <small>Complete imports in dependency order before society launch.</small>
          </div>
          <strong>{onboardingComplete?'READY FOR LAUNCH':committedStages+'/'+progress.length+' STAGES COMMITTED'}</strong>
        </div>
        <div style={{marginTop:14,padding:14,border:'1px solid #dbe7ea',borderRadius:12,background:'#f8fbfc'}}>
          {onboardingComplete
            ?<><b>Repository migration sequence complete</b><p style={{margin:'6px 0 0'}}>All migration stages are committed. Production cutover, external-source completeness and live launch approval remain separate controls.</p></>
            :<><b>Next required step: {nextStage?.label}</b><p style={{margin:'6px 0 0'}}>{nextStage?.blocked?'Commit the preceding migration stage before this stage can proceed.':nextStage?.ready?'Review clean evidence and explicitly commit the ready batch.':nextStage?.description}</p></>}
        </div>
      </section>

      <section style={panel}>
        <h2>Onboarding checklist</h2>
        <div style={grid}>
          {progress.map(item=>(
            <article key={item.entity} style={{...card,opacity:item.blocked?.72:1}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}>
                <b>{item.label}</b>
                <span>{item.status}</span>
              </div>
              <small>{item.description}</small>
              {item.blocked&&<small>Blocked until the previous stage is committed.</small>}
              {!item.blocked&&item.ready&&!item.committed&&<small>Evidence is ready for operator review and explicit commit.</small>}
            </article>
          ))}
        </div>
      </section>

      <section style={panel}>
        <h2>Migration batches</h2>
        {rows.length===0
          ?<p>No migration batches yet.</p>
          :<div style={{display:'grid',gap:10}}>
            {rows.map(row=>(
              <button key={row.id} onClick={()=>void inspect(row)} style={batchButton}>
                <span>
                  <b>{row.entityType.replaceAll('_',' ')}</b>
                  <small style={{display:'block'}}>{row.sourceLabel||row.id}</small>
                </span>
                <span>{row.status} · {row.validRows}/{row.totalRows} valid</span>
              </button>
            ))}
          </div>}
      </section>

      {detail&&(
        <section style={panel}>
          <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}>
            <div>
              <h2 style={{marginBottom:4}}>{detail.entityType.replaceAll('_',' ')} evidence</h2>
              <small>{detail.id}</small>
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <button disabled={busy} onClick={()=>void download()} style={button}>Export CSV</button>
              {detail.status==='READY'&&(
                <button disabled={busy||!cutoverReady} onClick={()=>setPendingAction('commit')} style={primary}>
                  Commit batch
                </button>
              )}
              {detail.status==='COMMITTED'&&(
                <button disabled={busy} onClick={()=>setPendingAction('rollback')} style={button}>Rollback</button>
              )}
            </div>
          </div>

          <div style={{...grid,marginTop:14}}>
            <article style={card}><b>Status</b><span>{detail.status}</span></article>
            <article style={card}><b>Rows</b><span>{detail.validRows} valid · {detail.invalidRows} invalid</span></article>
            <article style={card}><b>Duplicates</b><span>{detail.duplicateRows}</span></article>
            <article style={card}><b>Reference issues</b><span>{detail.referentialIssueCount}</span></article>
          </div>

          <div style={readinessBox}>
            <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}>
              <b>Cutover readiness</b>
              <strong>{cutoverReady?'READY':'ACTION REQUIRED'}</strong>
            </div>
            {blockers.length===0
              ?<small>{detail.status==='READY'?'Batch evidence is clean for explicit commit confirmation.':'Batch must be READY before commit.'}</small>
              :<ul style={{margin:'0 0 0 18px',padding:0}}>
                {blockers.map(item=><li key={item}>{item}</li>)}
              </ul>}
            <small>Readiness is derived from the current batch evidence only; production cutover and external source completeness remain separate.</small>
          </div>

          {pendingAction&&(
            <div role="group" aria-label="Migration action confirmation" style={confirmationBox}>
              <b>Confirm {pendingAction==='commit'?'commit':'rollback'}</b>
              <span>
                {pendingAction==='commit'
                  ?'This will apply the validated batch to society data.'
                  :'This will execute the repository rollback path for this committed batch.'}
              </span>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <button disabled={busy} onClick={()=>setPendingAction(null)} style={button}>Cancel</button>
                <button
                  disabled={busy||(pendingAction==='commit'&&!cutoverReady)}
                  onClick={()=>void mutate(pendingAction)}
                  style={pendingAction==='commit'?primary:button}
                >
                  Confirm {pendingAction}
                </button>
              </div>
            </div>
          )}

          {detail.financeReconciliation&&(
            <div style={readinessBox}>
              <b>Finance reconciliation</b>
              <p style={{margin:'8px 0 0'}}>
                Journal {detail.financeReconciliation.status??'Unknown'} · Debit ₹{((detail.financeReconciliation.debitPaise??0)/100).toFixed(2)} · Credit ₹{((detail.financeReconciliation.creditPaise??0)/100).toFixed(2)} · {detail.financeReconciliation.balanced?'Balanced':'Mismatch'}
              </p>
            </div>
          )}

          <div style={{marginTop:16,display:'grid',gap:8}}>
            {detail.rows.slice(0,100).map(row=>(
              <article key={row.rowNumber} style={rowCard}>
                <b>Row {row.rowNumber}</b>
                <span>
                  {row.valid?'Valid':'Needs attention'}
                  {row.targetType?' · '+row.targetType:''}
                  {row.targetId?' · '+row.targetId:''}
                </span>
              </article>
            ))}
            {detail.rows.length>100&&<small>Showing first 100 of {detail.rows.length} rows. Export CSV for complete evidence.</small>}
          </div>
        </section>
      )}
    </main>
  )
}

const panel:React.CSSProperties={marginTop:20,padding:20,border:'1px solid #dbe7ea',borderRadius:16,background:'white'}
const grid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10}
const card:React.CSSProperties={padding:14,border:'1px solid #e5e7eb',borderRadius:12,display:'grid',gap:4}
const rowCard:React.CSSProperties={...card,gridTemplateColumns:'90px 1fr'}
const batchButton:React.CSSProperties={padding:14,border:'1px solid #e5e7eb',borderRadius:12,background:'white',display:'flex',justifyContent:'space-between',gap:12,textAlign:'left'}
const button:React.CSSProperties={padding:'10px 14px',borderRadius:10,border:'1px solid #cbd5e1',background:'white',fontWeight:700}
const primary:React.CSSProperties={...button,background:'#05879A',color:'white',borderColor:'#05879A'}
const readinessBox:React.CSSProperties={marginTop:16,padding:14,border:'1px solid #dbe7ea',borderRadius:12,display:'grid',gap:8}
const confirmationBox:React.CSSProperties={...readinessBox,gap:10}
const errorBox:React.CSSProperties={marginTop:18,padding:12,border:'1px solid #ef4444',borderRadius:10}
