'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { ActionBar, ErrorState, FormField, PageHeader, PageShell, PrimaryButton, SecondaryButton, StatusPill } from '../../../components/admin-ui'
import { api, type Session } from '../../../lib/admin-client'

type TaxConfiguration={societyId?:string;gstEnabled:boolean;gstin?:string|null;tdsEnabled:boolean;tan?:string|null;defaultTdsSection?:string|null;defaultTdsBasisPoints?:number|null;updatedAt?:string}

const readRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','ACCOUNTANT'])
const manageRoles=new Set(['SUPER_ADMIN','ACCOUNTANT'])
function session():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw) as Session:null}catch{return null}}

export default function FinanceTaxConfigurationPage(){
  const[s,setS]=useState<Session|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const[gstEnabled,setGstEnabled]=useState(false),[gstin,setGstin]=useState(''),[tdsEnabled,setTdsEnabled]=useState(false),[tan,setTan]=useState(''),[tdsSection,setTdsSection]=useState(''),[tdsRate,setTdsRate]=useState('')

  const load=useCallback(async(x:Session)=>{setLoading(true);setError('');try{const c=await api<TaxConfiguration>('/accounting/tax/configuration',{},x);setGstEnabled(!!c.gstEnabled);setGstin(c.gstin??'');setTdsEnabled(!!c.tdsEnabled);setTan(c.tan??'');setTdsSection(c.defaultTdsSection??'');setTdsRate(c.defaultTdsBasisPoints==null?'':String(c.defaultTdsBasisPoints/100))}catch(e){setError(e instanceof Error?e.message:'Could not load tax configuration')}finally{setLoading(false)}},[])
  useEffect(()=>{const x=session();setS(x);if(x&&readRoles.has(x.role))void load(x);else setLoading(false)},[load])

  async function save(e:FormEvent){e.preventDefault();if(!s||!manageRoles.has(s.role))return;const pct=tdsRate.trim()===''?undefined:Number(tdsRate);if(pct!==undefined&&(!Number.isFinite(pct)||pct<0||pct>100)){setError('Default TDS rate must be between 0 and 100 percent.');return}setBusy(true);setError('');try{await api<TaxConfiguration>('/accounting/tax/configuration',{method:'PUT',body:JSON.stringify({gstEnabled,gstin:gstEnabled?gstin.trim():undefined,tdsEnabled,tan:tdsEnabled?tan.trim():undefined,defaultTdsSection:tdsEnabled?tdsSection.trim():undefined,defaultTdsBasisPoints:tdsEnabled&&pct!==undefined?Math.round(pct*100):undefined})},s);await load(s)}catch(err){setError(err instanceof Error?err.message:'Could not save tax configuration')}finally{setBusy(false)}}

  const canRead=!!s&&readRoles.has(s.role),canManage=!!s&&manageRoles.has(s.role)
  if(loading)return <PageShell><PageHeader title="GST / TDS configuration" description="Loading finance tax settings…"/></PageShell>
  if(!canRead)return <PageShell><PageHeader title="Finance access required" description="Finance read access is required." actions={<a href="/finance">Return to Finance</a>}/></PageShell>

  return <PageShell>
    <PageHeader context={`${s?.societyName??'Current society'} · ${s?.role.replaceAll('_',' ')}`} title="GST / TDS configuration" description="Enable tax metadata only when it applies to this society. Aaraagate does not assume universal GST or TDS treatment." actions={<a href="/finance">← Finance workspace</a>}/>
    {error&&<ErrorState title="Tax configuration failed" description={error}/>}
    <ActionBar label="Tax configuration actions"><SecondaryButton disabled={busy} onClick={()=>s&&void load(s)}>Refresh</SecondaryButton></ActionBar>
    {!canManage&&<div style={notice}>Read-only view. Only Accountant/Treasurer or platform finance roles can change tax configuration.</div>}
    <form onSubmit={save} style={panel}>
      <section>
        <div style={heading}><div><h2 style={{margin:0}}>GST support</h2><p style={subtle}>When disabled, GST document metadata is rejected by the API.</p></div><StatusPill label={gstEnabled?'ENABLED':'DISABLED'} tone={gstEnabled?'success':'neutral'}/></div>
        <label style={toggle}><input type="checkbox" checked={gstEnabled} disabled={!canManage||busy} onChange={e=>setGstEnabled(e.target.checked)}/><span>Enable GST metadata for this society</span></label>
        {gstEnabled&&<div style={grid}><FormField label="Society GSTIN" value={gstin} required={gstEnabled} maxLength={20} disabled={!canManage||busy} onChange={e=>setGstin(e.target.value.toUpperCase())}/></div>}
      </section>
      <hr style={divider}/>
      <section>
        <div style={heading}><div><h2 style={{margin:0}}>TDS support</h2><p style={subtle}>Defaults assist finance entry only; applicable section/rate remains an accounting decision.</p></div><StatusPill label={tdsEnabled?'ENABLED':'DISABLED'} tone={tdsEnabled?'success':'neutral'}/></div>
        <label style={toggle}><input type="checkbox" checked={tdsEnabled} disabled={!canManage||busy} onChange={e=>setTdsEnabled(e.target.checked)}/><span>Enable TDS metadata for this society</span></label>
        {tdsEnabled&&<div style={grid}>
          <FormField label="TAN (optional)" value={tan} maxLength={20} disabled={!canManage||busy} onChange={e=>setTan(e.target.value.toUpperCase())}/>
          <FormField label="Default TDS section (optional)" value={tdsSection} maxLength={20} disabled={!canManage||busy} onChange={e=>setTdsSection(e.target.value.toUpperCase())}/>
          <FormField label="Default TDS rate (%)" type="number" min="0" max="100" step="0.01" value={tdsRate} disabled={!canManage||busy} onChange={e=>setTdsRate(e.target.value)}/>
        </div>}
      </section>
      {canManage&&<div style={{marginTop:22}}><PrimaryButton type="submit" disabled={busy||gstEnabled&&!gstin.trim()} loading={busy}>Save tax configuration</PrimaryButton></div>}
    </form>
    <div style={boundary}><b>Boundary:</b> these controls only enable or disable optional GST/TDS metadata. They do not determine statutory applicability, filing obligations or legal compliance.</div>
  </PageShell>
}

const panel:React.CSSProperties={marginTop:20,padding:20,border:'1px solid #dbe7ea',borderRadius:16,background:'white',display:'grid',gap:20}
const grid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,240px),1fr))',gap:14,marginTop:14}
const heading:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:16,alignItems:'start',flexWrap:'wrap'}
const subtle:React.CSSProperties={margin:'6px 0 0',color:'#53636a'}
const toggle:React.CSSProperties={display:'flex',gap:10,alignItems:'center',marginTop:14,fontWeight:700}
const divider:React.CSSProperties={border:0,borderTop:'1px solid #e7eef0',width:'100%'}
const notice:React.CSSProperties={marginTop:18,padding:12,border:'1px solid #f59e0b',borderRadius:10,background:'#fffbeb'}
const boundary:React.CSSProperties={marginTop:18,padding:14,borderRadius:12,background:'#f8fafc',border:'1px solid #dbe7ea'}
