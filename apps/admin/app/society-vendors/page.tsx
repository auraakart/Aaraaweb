'use client'

import {FormEvent,useCallback,useEffect,useMemo,useState} from 'react'
import { api, type Session } from '../../lib/admin-client'

type Vendor={id:string;code:string;name:string;category:string;status:string;contactName?:string|null;phone?:string|null;email?:string|null;gstin?:string|null}
type RequestRow={
  id:string;requestNumber:string;title:string;description?:string|null;estimatedAmountPaise:number|string;status:string;
  preferredVendorId?:string|null;preferredVendorName?:string|null;selectedQuoteId?:string|null;createdAt?:string;submittedAt?:string|null;approvedAt?:string|null
}
type Quote={id:string;requestId:string;vendorId:string;vendorCode?:string;vendorName?:string;quoteReference?:string|null;amountPaise:number|string;validUntil?:string|null;notes?:string|null;status:string;createdAt?:string}
type PurchaseOrder={id:string;requestId:string;poNumber:string;vendorId:string;vendorCode?:string;vendorName?:string;amountPaise:number|string;terms?:string|null;status:string;issuedAt?:string}
type RequestEvent={id:string;eventType:string;note?:string|null;actorName?:string;createdAt?:string}

const readRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER','AUDITOR'])
const manageRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER'])

function session():Session|null{
  try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw) as Session:null}catch{return null}
}
const money=(value:number|string)=>`₹${(Number(value)/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const when=(value?:string|null)=>value?new Date(value).toLocaleString('en-IN'):'—'

export default function SocietyVendorsPage(){
  const s=typeof window==='undefined'?null:session()
  const allowed=!!s&&readRoles.has(s.role)
  const canManage=!!s&&manageRoles.has(s.role)

  const[vendors,setVendors]=useState<Vendor[]>([])
  const[requests,setRequests]=useState<RequestRow[]>([])
  const[purchaseOrders,setPurchaseOrders]=useState<PurchaseOrder[]>([])
  const[selectedRequestId,setSelectedRequestId]=useState('')
  const[quotes,setQuotes]=useState<Quote[]>([])
  const[history,setHistory]=useState<RequestEvent[]>([])
  const[loading,setLoading]=useState(true)
  const[detailLoading,setDetailLoading]=useState(false)
  const[busy,setBusy]=useState(false)
  const[error,setError]=useState('')
  const[success,setSuccess]=useState('')

  const[name,setName]=useState('')
  const[code,setCode]=useState('')
  const[category,setCategory]=useState('')
  const[requestNumber,setRequestNumber]=useState('')
  const[title,setTitle]=useState('')
  const[amount,setAmount]=useState('0')

  const[quoteVendorId,setQuoteVendorId]=useState('')
  const[quoteReference,setQuoteReference]=useState('')
  const[quoteAmount,setQuoteAmount]=useState('0')
  const[quoteValidUntil,setQuoteValidUntil]=useState('')
  const[quoteNotes,setQuoteNotes]=useState('')
  const[poNumber,setPoNumber]=useState('')
  const[poTerms,setPoTerms]=useState('')

  const selectedRequest=useMemo(()=>requests.find(r=>r.id===selectedRequestId)??null,[requests,selectedRequestId])
  const selectedPo=useMemo(()=>purchaseOrders.find(po=>po.requestId===selectedRequestId)??null,[purchaseOrders,selectedRequestId])
  const activeVendors=useMemo(()=>vendors.filter(v=>v.status==='ACTIVE'),[vendors])

  const load=useCallback(async()=>{
    if(!s||!allowed)return
    setLoading(true);setError('')
    try{
      const[v,r,po]=await Promise.all([
        api<Vendor[]>('/society-vendors',{},s),
        api<RequestRow[]>('/society-vendors/procurement/requests',{},s),
        api<PurchaseOrder[]>('/vendors/procurement/purchase-orders/list',{},s),
      ])
      setVendors(v);setRequests(r);setPurchaseOrders(po)
      setSelectedRequestId(current=>current&&r.some(item=>item.id===current)?current:(r[0]?.id??''))
    }catch(e){setError(e instanceof Error?e.message:'Vendor operations could not be loaded')}
    finally{setLoading(false)}
  },[s?.accessToken,allowed])

  const loadDetail=useCallback(async(requestId:string)=>{
    if(!s||!allowed||!requestId){setQuotes([]);setHistory([]);return}
    setDetailLoading(true)
    try{
      const[q,h]=await Promise.all([
        api<Quote[]>(`/vendors/procurement/${requestId}/quotes`,{},s),
        api<RequestEvent[]>(`/society-vendors/procurement/requests/${requestId}/history`,{},s),
      ])
      setQuotes(q);setHistory(h)
    }catch(e){setError(e instanceof Error?e.message:'Procurement detail could not be loaded')}
    finally{setDetailLoading(false)}
  },[s?.accessToken,allowed])

  useEffect(()=>{void load()},[load])
  useEffect(()=>{void loadDetail(selectedRequestId)},[loadDetail,selectedRequestId])

  const run=async(fn:()=>Promise<void>,message:string)=>{
    setBusy(true);setError('');setSuccess('')
    try{
      await fn();setSuccess(message);await load()
      if(selectedRequestId)await loadDetail(selectedRequestId)
    }catch(e){setError(e instanceof Error?e.message:'Operation failed')}
    finally{setBusy(false)}
  }

  const createVendor=(e:FormEvent)=>{
    e.preventDefault();if(!s||!canManage)return
    void run(async()=>{
      await api('/society-vendors',{method:'POST',body:JSON.stringify({name:name.trim(),code:code.trim(),category:category.trim()})},s)
      setName('');setCode('');setCategory('')
    },'Vendor created.')
  }

  const createRequest=(e:FormEvent)=>{
    e.preventDefault();if(!s||!canManage)return
    void run(async()=>{
      const created=await api<RequestRow>('/society-vendors/procurement/requests',{method:'POST',body:JSON.stringify({
        requestNumber:requestNumber.trim(),title:title.trim(),estimatedAmountPaise:Math.round(Number(amount)*100),
      })},s)
      setRequestNumber('');setTitle('');setAmount('0');setSelectedRequestId(created.id)
    },'Procurement request created.')
  }

  const requestAction=(id:string,a:'submit'|'approve'|'reject')=>{
    if(!s||!canManage)return
    void run(()=>api(`/society-vendors/procurement/requests/${id}/${a}`,{method:'PATCH',body:'{}'},s).then(()=>undefined),`Request ${a} recorded.`)
  }

  const addQuote=(e:FormEvent)=>{
    e.preventDefault();if(!s||!canManage||!selectedRequest)return
    void run(async()=>{
      await api(`/vendors/procurement/${selectedRequest.id}/quotes`,{method:'POST',body:JSON.stringify({
        vendorId:quoteVendorId,
        quoteReference:quoteReference.trim()||undefined,
        amountPaise:Math.round(Number(quoteAmount)*100),
        validUntil:quoteValidUntil||undefined,
        notes:quoteNotes.trim()||undefined,
      })},s)
      setQuoteVendorId('');setQuoteReference('');setQuoteAmount('0');setQuoteValidUntil('');setQuoteNotes('')
    },'Quotation recorded.')
  }

  const selectQuote=(quoteId:string)=>{
    if(!s||!canManage||!selectedRequest)return
    void run(()=>api(`/vendors/procurement/${selectedRequest.id}/select-quote`,{method:'POST',body:JSON.stringify({quoteId})},s).then(()=>undefined),'Quotation selected.')
  }

  const issuePurchaseOrder=(e:FormEvent)=>{
    e.preventDefault();if(!s||!canManage||!selectedRequest)return
    void run(async()=>{
      await api(`/vendors/procurement/${selectedRequest.id}/purchase-order`,{method:'POST',body:JSON.stringify({poNumber:poNumber.trim(),terms:poTerms.trim()||undefined})},s)
      setPoNumber('');setPoTerms('')
    },'Purchase order issued.')
  }

  if(!s||!allowed)return <main style={page}><h1>Society vendor access required</h1><a href={s?.role==='AUDITOR'?'/audit':'/'}>Return</a></main>

  return <main style={page}>
    <header style={header}>
      <div>
        <small>{s.societyName??'Current society'} · {s.role.replaceAll('_',' ')}</small>
        <h1>Society vendors & procurement</h1>
        <p>{canManage?'Operate vendor, quotation and purchase-order workflows with auditable evidence.':'Read-only society vendor and procurement evidence.'}</p>
      </div>
      <div style={actions}><a href="/society-vendors/contracts">Vendor contracts & SLA →</a><a href={s.role==='AUDITOR'?'/audit':'/'}>← Back</a></div>
    </header>

    {error&&<p style={err}>{error}</p>}
    {success&&<p style={ok}>{success}</p>}

    {canManage&&<div style={grid}>
      <form onSubmit={createVendor} style={panel}>
        <h2>Add vendor</h2>
        <label style={label}>Code<input style={input} value={code} onChange={e=>setCode(e.target.value)} required maxLength={64}/></label>
        <label style={label}>Name<input style={input} value={name} onChange={e=>setName(e.target.value)} required maxLength={200}/></label>
        <label style={label}>Category<input style={input} value={category} onChange={e=>setCategory(e.target.value)} required maxLength={120}/></label>
        <button style={primary} disabled={busy}>Create vendor</button>
      </form>
      <form onSubmit={createRequest} style={panel}>
        <h2>New procurement request</h2>
        <label style={label}>Request number<input style={input} value={requestNumber} onChange={e=>setRequestNumber(e.target.value)} required maxLength={64}/></label>
        <label style={label}>Title<input style={input} value={title} onChange={e=>setTitle(e.target.value)} required maxLength={200}/></label>
        <label style={label}>Estimated amount (₹)<input style={input} type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required/></label>
        <button style={primary} disabled={busy}>Create request</button>
      </form>
    </div>}

    <section style={panel}>
      <h2>Vendors</h2>
      {loading?<p>Loading…</p>:vendors.length===0?<p>No society vendors.</p>:<div style={list}>{vendors.map(v=>
        <article key={v.id} style={row}>
          <div style={stack}><b>{v.name}</b><span>{v.code} · {v.category}</span><small>{v.status}{v.gstin?` · GSTIN ${v.gstin}`:''}</small></div>
          {canManage&&v.status!=='ARCHIVED'&&<button style={secondary} disabled={busy} onClick={()=>void run(()=>api(`/society-vendors/${v.id}/status`,{method:'PATCH',body:JSON.stringify({status:v.status==='ACTIVE'?'SUSPENDED':'ACTIVE'})},s).then(()=>undefined),'Vendor status updated.')}>{v.status==='ACTIVE'?'Suspend':'Activate'}</button>}
        </article>
      )}</div>}
    </section>

    <section style={panel}>
      <div style={sectionHeading}><div><h2>Procurement requests</h2><p style={muted}>Open a request to compare quotations, review evidence and issue its PO.</p></div></div>
      {requests.length===0?<p>No procurement requests.</p>:<div style={list}>{requests.map(r=>
        <article key={r.id} style={{...row,background:r.id===selectedRequestId?'#f0fbfd':'white'}}>
          <div style={stack}>
            <b>{r.requestNumber} · {r.title}</b>
            <span>{r.status} · {money(r.estimatedAmountPaise)}</span>
            {r.preferredVendorName&&<small>Preferred/selected vendor: {r.preferredVendorName}</small>}
            {r.selectedQuoteId&&<small>Selected quotation recorded</small>}
          </div>
          <div style={actions}>
            <button style={secondary} disabled={busy} onClick={()=>setSelectedRequestId(r.id)}>{r.id===selectedRequestId?'Open':'Review'}</button>
            {canManage&&r.status==='DRAFT'&&<button style={secondary} disabled={busy} onClick={()=>requestAction(r.id,'submit')}>Submit</button>}
            {canManage&&r.status==='SUBMITTED'&&<>
              <button style={primaryInline} disabled={busy} onClick={()=>requestAction(r.id,'approve')}>Approve</button>
              <button style={secondary} disabled={busy} onClick={()=>requestAction(r.id,'reject')}>Reject</button>
            </>}
          </div>
        </article>
      )}</div>}
    </section>

    {selectedRequest&&<section style={panel}>
      <div style={sectionHeading}>
        <div>
          <small>Procurement workspace</small>
          <h2>{selectedRequest.requestNumber} · {selectedRequest.title}</h2>
          <p style={muted}>{selectedRequest.status} · estimate {money(selectedRequest.estimatedAmountPaise)} · created {when(selectedRequest.createdAt)}</p>
        </div>
        {selectedPo&&<span style={badge}>PO {selectedPo.poNumber} · {selectedPo.status}</span>}
      </div>

      {selectedRequest.status==='SUBMITTED'&&!selectedRequest.selectedQuoteId&&<p style={warn}>
        For a purchase-order flow, select a quotation before approval. Quote selection is available while the request is submitted; PO issuance requires an approved request with a selected quotation.
      </p>}

      <div style={grid}>
        <section style={subpanel}>
          <h3>Quotation comparison</h3>
          {detailLoading?<p>Loading quotations…</p>:quotes.length===0?<p>No quotations recorded.</p>:<div style={list}>{quotes.map(q=>
            <article key={q.id} style={{...row,alignItems:'flex-start'}}>
              <div style={stack}>
                <b>{q.vendorName??q.vendorId}</b>
                <span>{money(q.amountPaise)} · {q.status}</span>
                <small>{q.quoteReference?`Ref ${q.quoteReference}`:'No reference'} · valid until {q.validUntil??'not specified'}</small>
                {q.notes&&<small>{q.notes}</small>}
              </div>
              {canManage&&selectedRequest.status==='SUBMITTED'&&q.status==='RECEIVED'&&<button style={primaryInline} disabled={busy} onClick={()=>selectQuote(q.id)}>Select quote</button>}
            </article>
          )}</div>}

          {canManage&&['DRAFT','SUBMITTED'].includes(selectedRequest.status)&&<form onSubmit={addQuote} style={formBlock}>
            <h4>Record quotation</h4>
            <label style={label}>Active vendor<select style={input} value={quoteVendorId} onChange={e=>setQuoteVendorId(e.target.value)} required><option value="">Select vendor</option>{activeVendors.map(v=><option key={v.id} value={v.id}>{v.code} · {v.name}</option>)}</select></label>
            <label style={label}>Amount (₹)<input style={input} type="number" min="0" step="0.01" value={quoteAmount} onChange={e=>setQuoteAmount(e.target.value)} required/></label>
            <label style={label}>Quote reference<input style={input} value={quoteReference} onChange={e=>setQuoteReference(e.target.value)} maxLength={160}/></label>
            <label style={label}>Valid until<input style={input} type="date" value={quoteValidUntil} onChange={e=>setQuoteValidUntil(e.target.value)}/></label>
            <label style={label}>Notes<textarea style={input} value={quoteNotes} onChange={e=>setQuoteNotes(e.target.value)} maxLength={2000}/></label>
            <button style={primary} disabled={busy||activeVendors.length===0}>Add quotation</button>
          </form>}
        </section>

        <section style={subpanel}>
          <h3>Purchase order</h3>
          {selectedPo?<div style={stack}>
            <b>{selectedPo.poNumber}</b>
            <span>{selectedPo.vendorName??selectedPo.vendorId} · {money(selectedPo.amountPaise)}</span>
            <small>{selectedPo.status} · issued {when(selectedPo.issuedAt)}</small>
            {selectedPo.terms&&<small>{selectedPo.terms}</small>}
          </div>:<>
            <p style={muted}>A PO can be issued after request approval and quote selection.</p>
            {canManage&&selectedRequest.status==='APPROVED'&&selectedRequest.selectedQuoteId&&<form onSubmit={issuePurchaseOrder} style={formBlock}>
              <label style={label}>PO number<input style={input} value={poNumber} onChange={e=>setPoNumber(e.target.value)} required maxLength={64}/></label>
              <label style={label}>Terms<textarea style={input} value={poTerms} onChange={e=>setPoTerms(e.target.value)} maxLength={3000}/></label>
              <button style={primary} disabled={busy}>Issue purchase order</button>
            </form>}
          </>}
        </section>
      </div>

      <section style={subpanel}>
        <h3>Request evidence history</h3>
        {detailLoading?<p>Loading history…</p>:history.length===0?<p>No evidence events.</p>:<div style={list}>{history.map(e=>
          <article key={e.id} style={row}>
            <div style={stack}><b>{e.eventType.replaceAll('_',' ')}</b><span>{e.note??'No note'}</span><small>{e.actorName??'Recorded actor'} · {when(e.createdAt)}</small></div>
          </article>
        )}</div>}
      </section>
    </section>}
  </main>
}

const page:React.CSSProperties={maxWidth:1180,margin:'0 auto',padding:'28px 22px 80px'}
const header:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap'}
const grid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:16}
const panel:React.CSSProperties={marginTop:18,padding:20,border:'1px solid #dbe7ea',borderRadius:16,background:'white'}
const subpanel:React.CSSProperties={marginTop:14,padding:16,border:'1px solid #e2e8f0',borderRadius:14,background:'#fbfdfe'}
const formBlock:React.CSSProperties={marginTop:16,paddingTop:14,borderTop:'1px solid #e2e8f0'}
const label:React.CSSProperties={display:'grid',gap:6,marginTop:10,fontWeight:700}
const input:React.CSSProperties={padding:10,border:'1px solid #cbd5e1',borderRadius:10,font:'inherit'}
const primary:React.CSSProperties={marginTop:12,padding:'10px 14px',border:0,borderRadius:10,background:'#05879A',color:'white',fontWeight:800}
const primaryInline:React.CSSProperties={padding:'9px 12px',border:0,borderRadius:10,background:'#05879A',color:'white',fontWeight:800}
const secondary:React.CSSProperties={padding:'9px 12px',border:'1px solid #cbd5e1',borderRadius:10,background:'white',fontWeight:700}
const list:React.CSSProperties={display:'grid',gap:10}
const row:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',padding:12,border:'1px solid #e2e8f0',borderRadius:12}
const stack:React.CSSProperties={display:'grid',gap:4}
const actions:React.CSSProperties={display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}
const sectionHeading:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:16,alignItems:'flex-start',flexWrap:'wrap'}
const badge:React.CSSProperties={padding:'7px 10px',borderRadius:999,background:'#ecfeff',border:'1px solid #a5f3fc',fontWeight:800}
const muted:React.CSSProperties={color:'#475569',marginTop:4}
const err:React.CSSProperties={padding:12,background:'#fef2f2',color:'#991b1b',borderRadius:10}
const ok:React.CSSProperties={padding:12,background:'#ecfdf5',color:'#065f46',borderRadius:10}
const warn:React.CSSProperties={padding:12,background:'#fffbeb',color:'#92400e',borderRadius:10,border:'1px solid #fde68a'}
