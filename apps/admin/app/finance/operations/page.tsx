'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { ActionBar, EmptyState, ErrorState, FormField, PageHeader, PageShell, PrimaryButton, SecondaryButton, SelectField } from '../../../components/admin-ui'
import { api, type Session } from '../../../lib/admin-client'

type Expense={id:string;expenseNumber:string;vendorName:string;invoiceReference?:string|null;expenseDate:string;dueDate?:string|null;description:string;amountPaise:string;status:string;expenseAccountId:string;fundId?:string|null;journalEntryId?:string|null;payableId?:string|null;payableStatus?:string|null;payableOutstandingRaw?:string|number}
type Payable={id:string;expenseId:string;expenseNumber:string;vendorName:string;status:string;dueDate?:string|null;originalAmountPaise:string;outstandingPaise:string}
type Budget={id:string;code:string;name:string;startsOn:string;endsOn:string;status:string;budgetPaise:string}
type Actual={accountId:string;fundId?:string|null;budgetPaise:string;actualPaise:string}
type Fund={id:string;code:string;name:string;utilizedPaise:string}
type Account={id:string;code:string;name:string;type:string;active:boolean}
type Journal={id:string;entryNumber:string;status:string;debitPaise:string;creditPaise:string}
type ExpenseIntakeCandidate={id:string;expenseNumber:string;vendorName:string;invoiceReference?:string|null;expenseDate:string;amountPaise:string;status:string;dateDistanceDays:number;signals:string[];classification:'DUPLICATE_EXACT'|'REVIEW_REFERENCE_CONFLICT'|'REVIEW_SIMILAR'|'RELATED'}
type ExpenseIntakeAssessment={status:'CLEAR'|'DUPLICATE_EXACT'|'REVIEW_REFERENCE_CONFLICT'|'REVIEW_SIMILAR';candidates:ExpenseIntakeCandidate[];mutationPerformed:false;automaticPosting:false;boundary:string}
type FinanceDocumentIntakePreview={extracted:{vendorName:string|null;invoiceReference:string|null;expenseDate:string|null;amountPaise:number|null;gstin:string|null};quality:'COMPLETE'|'PARTIAL'|'LIMITED';signals:string[];missingFields:string[];source:{sha256:string;characterCount:number;rawTextPersisted:false};duplicateAssessment:ExpenseIntakeAssessment|null;mutationPerformed:false;automaticPosting:false;humanReviewRequired:true;boundary:string}

const readRoles=new Set(['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','ACCOUNTANT'])
const manageRoles=new Set(['SUPER_ADMIN','ACCOUNTANT'])
const money=(v:string|number|undefined)=>`₹${(Number(v??0)/100).toLocaleString('en-IN',{maximumFractionDigits:2})}`
const today=()=>new Date().toISOString().slice(0,10)
function session():Session|null{try{const raw=sessionStorage.getItem('aaraagate.admin.session');return raw?JSON.parse(raw) as Session:null}catch{return null}}

export default function FinanceOperationsPage(){
  const[s,setS]=useState<Session|null>(null),[expenses,setExpenses]=useState<Expense[]>([]),[payables,setPayables]=useState<Payable[]>([]),[budgets,setBudgets]=useState<Budget[]>([]),[funds,setFunds]=useState<Fund[]>([]),[accounts,setAccounts]=useState<Account[]>([]),[journals,setJournals]=useState<Journal[]>([]),[actuals,setActuals]=useState<Actual[]>([]),[selectedBudget,setSelectedBudget]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('')
  const[expenseNo,setExpenseNo]=useState(''),[vendor,setVendor]=useState(''),[invoiceReference,setInvoiceReference]=useState(''),[description,setDescription]=useState(''),[amount,setAmount]=useState(''),[expenseDate,setExpenseDate]=useState(today()),[dueDate,setDueDate]=useState(''),[expenseAccount,setExpenseAccount]=useState(''),[intake,setIntake]=useState<ExpenseIntakeAssessment|null>(null),[intakeConfirmed,setIntakeConfirmed]=useState(false)
  const[invoiceText,setInvoiceText]=useState(''),[documentPreview,setDocumentPreview]=useState<FinanceDocumentIntakePreview|null>(null)
  const[budgetCode,setBudgetCode]=useState(''),[budgetName,setBudgetName]=useState(''),[budgetStart,setBudgetStart]=useState(today()),[budgetEnd,setBudgetEnd]=useState(today()),[budgetAccount,setBudgetAccount]=useState(''),[budgetAmount,setBudgetAmount]=useState('')
  const[actionExpense,setActionExpense]=useState<Expense|null>(null),[expenseAction,setExpenseAction]=useState<'approve'|'post'|null>(null),[payableAccount,setPayableAccount]=useState(''),[journalNumber,setJournalNumber]=useState('')
  const[settlementPayable,setSettlementPayable]=useState<Payable|null>(null),[settlementAmount,setSettlementAmount]=useState(''),[settlementJournal,setSettlementJournal]=useState(''),[settlementAttemptKey,setSettlementAttemptKey]=useState('')
  const canRead=!!s&&readRoles.has(s.role),canManage=!!s&&manageRoles.has(s.role)
  const load=useCallback(async(x:Session)=>{setLoading(true);setError('');try{const[e,p,b,f,a,j]=await Promise.all([api<Expense[]>('/accounting/finance-operations/expenses',{},x),api<Payable[]>('/accounting/finance-operations/payables',{},x),api<Budget[]>('/accounting/finance-operations/budgets',{},x),api<Fund[]>('/accounting/finance-operations/fund-utilization',{},x),api<Account[]>('/accounting/accounts',{},x),api<Journal[]>('/accounting/journals',{},x)]);setExpenses(e);setPayables(p);setBudgets(b);setFunds(f);setAccounts(a);setJournals(j)}catch(err){setError(err instanceof Error?err.message:'Could not load finance operations')}finally{setLoading(false)}},[])
  useEffect(()=>{const x=session();setS(x);if(x&&readRoles.has(x.role))void load(x);else setLoading(false)},[load])

  async function mutate(path:string,body?:unknown):Promise<boolean>{if(!s||!canManage)return false;setBusy(true);setError('');try{await api(path,{method:'POST',body:body===undefined?undefined:JSON.stringify(body)},s);await load(s);return true}catch(err){setError(err instanceof Error?err.message:'Finance operation failed');return false}finally{setBusy(false)}}
  async function prepareInvoiceText(){
    if(!s||!canManage||busy)return;
    if(invoiceText.trim().length<20){setError('Paste at least 20 characters of reviewed invoice text.');return}
    setBusy(true);setError('');
    try{
      const preview=await api<FinanceDocumentIntakePreview>('/accounting/finance-operations/expenses/document-intake-preview',{method:'POST',body:JSON.stringify({reviewedText:invoiceText})},s);
      setDocumentPreview(preview);
      if(preview.extracted.vendorName)setVendor(preview.extracted.vendorName);
      if(preview.extracted.invoiceReference)setInvoiceReference(preview.extracted.invoiceReference);
      if(preview.extracted.expenseDate)setExpenseDate(preview.extracted.expenseDate);
      if(preview.extracted.amountPaise)setAmount((preview.extracted.amountPaise/100).toString());
      if(preview.extracted.invoiceReference)setDescription(current=>current||`Invoice ${preview.extracted.invoiceReference}`);
      setIntake(preview.duplicateAssessment);setIntakeConfirmed(false);
    }catch(err){setError(err instanceof Error?err.message:'Could not prepare reviewed invoice text')}
    finally{setBusy(false)}
  }

  async function createExpense(e:FormEvent){
    e.preventDefault();
    if(!s||!canManage||busy)return;
    const rupees=Number(amount),amountPaise=Math.round(rupees*100);
    if(!Number.isFinite(rupees)||rupees<=0||!expenseAccount){setError('Enter a valid amount and expense account.');return}
    setBusy(true);setError('');
    try{
      const current=await api<ExpenseIntakeAssessment>('/accounting/finance-operations/expenses/intake-assessment',{method:'POST',body:JSON.stringify({vendorName:vendor,invoiceReference:invoiceReference.trim()||undefined,expenseDate,amountPaise})},s);
      const fingerprint=(assessment:ExpenseIntakeAssessment)=>[assessment.status,...assessment.candidates.map(candidate=>`${candidate.id}:${candidate.classification}`)].join('|');
      const evidenceUnchanged=!!intake&&fingerprint(intake)===fingerprint(current);
      setIntake(current);
      if(current.status!=='CLEAR'&&(!intakeConfirmed||!evidenceUnchanged)){
        setIntakeConfirmed(false);
        return;
      }
      await api('/accounting/finance-operations/expenses',{method:'POST',body:JSON.stringify({expenseNumber:expenseNo,vendorName:vendor,invoiceReference:invoiceReference.trim()||undefined,expenseDate,dueDate:dueDate||undefined,description,amountPaise,expenseAccountId:expenseAccount})},s);
      setExpenseNo('');setVendor('');setInvoiceReference('');setDescription('');setAmount('');setIntake(null);setIntakeConfirmed(false);setInvoiceText('');setDocumentPreview(null);
      await load(s);
    }catch(err){setError(err instanceof Error?err.message:'Could not review or create expense draft')}
    finally{setBusy(false)}
  }
  function approveExpense(x:Expense){setActionExpense(x);setExpenseAction('approve');setPayableAccount('')}
  function postExpense(x:Expense){setActionExpense(x);setExpenseAction('post');setJournalNumber(`EXP-${x.expenseNumber}`)}
  async function submitExpenseAction(e:FormEvent){e.preventDefault();if(!actionExpense||!expenseAction)return;let ok=false;if(expenseAction==='approve'){if(!payableAccount)return setError('Choose a payable liability account.');ok=await mutate(`/accounting/finance-operations/expenses/${actionExpense.id}/approve`,{payableAccountId:payableAccount})}else{if(!journalNumber.trim())return setError('Enter a journal entry number.');ok=await mutate(`/accounting/finance-operations/expenses/${actionExpense.id}/post`,{entryNumber:journalNumber.trim()})}if(!ok)return;setActionExpense(null);setExpenseAction(null);setPayableAccount('');setJournalNumber('')}
  function settlePayable(p:Payable){setSettlementPayable(p);setSettlementAmount((Number(p.outstandingPaise)/100).toString());setSettlementJournal('');setSettlementAttemptKey('')}
  async function submitSettlement(e:FormEvent){e.preventDefault();if(!settlementPayable)return;const amountR=Number(settlementAmount);if(!Number.isFinite(amountR)||amountR<=0)return setError('Enter a positive settlement amount.');if(amountR*100>Number(settlementPayable.outstandingPaise))return setError('Settlement cannot exceed the outstanding payable amount.');if(!settlementJournal)return setError('Choose a posted payment journal.');const attemptKey=settlementAttemptKey||`admin-${settlementPayable.id}-${Date.now()}`;if(!settlementAttemptKey)setSettlementAttemptKey(attemptKey);if(!await mutate(`/accounting/finance-operations/payables/${settlementPayable.id}/settle`,{amountPaise:Math.round(amountR*100),settlementDate:today(),journalEntryId:settlementJournal,idempotencyKey:attemptKey}))return;setSettlementPayable(null);setSettlementAmount('');setSettlementJournal('');setSettlementAttemptKey('')}
  async function createBudget(e:FormEvent){e.preventDefault();const rupees=Number(budgetAmount);if(!budgetAccount||!Number.isFinite(rupees)||rupees<0)return setError('Choose an account and enter a valid budget amount.');if(!await mutate('/accounting/finance-operations/budgets',{code:budgetCode,name:budgetName,startsOn:budgetStart,endsOn:budgetEnd,lines:[{accountId:budgetAccount,amountPaise:Math.round(rupees*100)}]}))return;setBudgetCode('');setBudgetName('');setBudgetAmount('')}
  async function showActuals(id:string){if(!s)return;setSelectedBudget(id);setError('');try{setActuals(await api<Actual[]>(`/accounting/finance-operations/budgets/${id}/actuals`,{},s))}catch(err){setError(err instanceof Error?err.message:'Could not load budget actuals')}}
  async function exportSnapshot(){if(!s)return;setBusy(true);try{const data=await api<unknown>('/accounting/finance-operations/export',{},s);const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`aaraagate-finance-${today()}.json`;a.click();URL.revokeObjectURL(url)}catch(err){setError(err instanceof Error?err.message:'Could not export finance snapshot')}finally{setBusy(false)}}

  if(loading)return <PageShell><PageHeader title="Finance operations" description="Loading finance operations…"/></PageShell>
  if(!canRead)return <PageShell><PageHeader title="Finance access required" actions={<a href="/finance">Return to Finance</a>}/></PageShell>
  const expenseAccounts=accounts.filter(a=>a.type==='EXPENSE'&&a.active),liabilityAccounts=accounts.filter(a=>a.type==='LIABILITY'&&a.active)
  return <PageShell>
    <PageHeader context={`${s?.societyName??'Current society'} · ${s?.role.replaceAll('_',' ')}`} title="Finance operations" description="Expenses, payables, budgets, utilization and export-ready controls." actions={<a href="/finance">← Finance</a>}/>
    {error&&<ErrorState title="Finance operation failed" description={error}/>}<ActionBar label="Finance operations actions"><SecondaryButton disabled={busy} onClick={()=>void exportSnapshot()}>Export snapshot</SecondaryButton><SecondaryButton disabled={busy} onClick={()=>s&&void load(s)}>Refresh</SecondaryButton></ActionBar>{!canManage&&<div style={notice}>Read-only mode. Posting and approvals require Accountant/Treasurer or platform finance access.</div>}
    {canManage&&actionExpense&&expenseAction&&<section style={panel}><div style={header}><div><h2 style={{margin:'0 0 4px'}}>{expenseAction==='approve'?'Approve expense':'Post expense'}</h2><small>{actionExpense.expenseNumber} · {actionExpense.vendorName} · {money(actionExpense.amountPaise)}</small></div><SecondaryButton type="button" onClick={()=>{setActionExpense(null);setExpenseAction(null)}}>Cancel</SecondaryButton></div><form onSubmit={submitExpenseAction} style={{...grid,marginTop:14}}>{expenseAction==='approve'?<SelectField label="Payable liability account" required value={payableAccount} onChange={e=>setPayableAccount(e.target.value)}><option value="">Choose liability account</option>{accounts.filter(a=>a.type==='LIABILITY'&&a.active).map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</SelectField>:<FormField label="Journal entry number" required value={journalNumber} onChange={e=>setJournalNumber(e.target.value)}/>}<PrimaryButton type="submit" loading={busy}>{expenseAction==='approve'?'Approve expense':'Post expense'}</PrimaryButton></form></section>}
    {canManage&&settlementPayable&&<section style={panel}><div style={header}><div><h2 style={{margin:'0 0 4px'}}>Record payable settlement</h2><small>{settlementPayable.expenseNumber} · {settlementPayable.vendorName} · outstanding {money(settlementPayable.outstandingPaise)}</small></div><SecondaryButton type="button" onClick={()=>{setSettlementPayable(null);setSettlementAttemptKey('')}}>Cancel</SecondaryButton></div><form onSubmit={submitSettlement} style={{...grid,marginTop:14}}><FormField label="Settlement amount (₹)" required type="number" min="0.01" step="0.01" max={(Number(settlementPayable.outstandingPaise)/100).toString()} value={settlementAmount} onChange={e=>{setSettlementAmount(e.target.value);setSettlementAttemptKey('')}}/><SelectField label="Posted payment journal" required value={settlementJournal} onChange={e=>{setSettlementJournal(e.target.value);setSettlementAttemptKey('')}}><option value="">Choose posted journal</option>{journals.filter(j=>j.status==='POSTED').map(j=><option key={j.id} value={j.id}>{j.entryNumber} · {money(j.debitPaise)}</option>)}</SelectField><PrimaryButton type="submit" loading={busy} disabled={!settlementJournal}>Record settlement</PrimaryButton></form></section>}

    {canManage&&<section style={panel}><h2 style={{marginTop:0}}>New expense</h2><p style={{marginTop:0}}>A deterministic duplicate/conflict review runs before draft creation. It never posts accounting automatically.</p>
      <div style={{margin:'14px 0',padding:14,border:'1px solid #cbd5e1',borderRadius:12,background:'#f8fafc'}}>
        <h3 style={{marginTop:0}}>Reviewed invoice text intake</h3>
        <p>Paste reviewed invoice text to prepare fields. The source text is hashed for this response but is not stored; no expense, approval or journal is created.</p>
        <FormField label="Reviewed invoice text" multiline value={invoiceText} onChange={e=>{setInvoiceText(e.target.value);setDocumentPreview(null)}} maxLength={12000}/>
        <ActionBar label="Invoice text preparation"><SecondaryButton type="button" loading={busy} disabled={invoiceText.trim().length<20} onClick={()=>void prepareInvoiceText()}>Prepare draft fields</SecondaryButton></ActionBar>
        {documentPreview&&<div style={{marginTop:10}}>
          <b>Extraction: {documentPreview.quality}</b> · <small>{documentPreview.source.characterCount} characters · source hash {documentPreview.source.sha256.slice(0,12)}…</small>
          <p style={{margin:'6px 0'}}>Found: {documentPreview.signals.length?documentPreview.signals.map(v=>v.replaceAll('_',' ')).join(' · '):'No labelled finance fields found'}.</p>
          {documentPreview.missingFields.length>0&&<p style={{margin:'6px 0'}}>Review required for: {documentPreview.missingFields.join(', ')}.</p>}
          <small>{documentPreview.boundary}</small>
        </div>}
      </div>
      <form onSubmit={createExpense} style={grid}><FormField label="Expense no." required value={expenseNo} onChange={e=>{setExpenseNo(e.target.value);setIntake(null);setIntakeConfirmed(false)}}/><FormField label="Vendor / payee" required value={vendor} onChange={e=>{setVendor(e.target.value);setIntake(null);setIntakeConfirmed(false)}}/><FormField label="Invoice / reference" value={invoiceReference} onChange={e=>{setInvoiceReference(e.target.value);setIntake(null);setIntakeConfirmed(false)}} maxLength={120}/><FormField label="Expense date" type="date" value={expenseDate} onChange={e=>{setExpenseDate(e.target.value);setIntake(null);setIntakeConfirmed(false)}}/><FormField label="Due date" type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/><FormField label="Amount (₹)" type="number" min="0.01" step="0.01" value={amount} onChange={e=>{setAmount(e.target.value);setIntake(null);setIntakeConfirmed(false)}}/><SelectField label="Expense account" required value={expenseAccount} onChange={e=>setExpenseAccount(e.target.value)}><option value="">Choose account</option>{expenseAccounts.map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</SelectField><FormField label="Description" required value={description} onChange={e=>setDescription(e.target.value)}/><PrimaryButton type="submit" loading={busy}>{intake&&intake.status!=='CLEAR'&&intakeConfirmed?'Create reviewed draft':'Review & create draft'}</PrimaryButton></form>{intake&&<div style={{marginTop:14,padding:14,border:'1px solid #cbd5e1',borderRadius:12,background:intake.status==='CLEAR'?'#f0fdf4':'#fffbeb'}}><b>Intake review: {intake.status.replaceAll('_',' ')}</b>{intake.candidates.length>0&&<div style={{display:'grid',gap:7,marginTop:10}}>{intake.candidates.map(candidate=><div key={candidate.id} style={{paddingTop:7,borderTop:'1px solid #e5e7eb'}}><span><b>{candidate.expenseNumber}</b> · {candidate.vendorName} · {money(candidate.amountPaise)}</span><br/><small>{candidate.classification.replaceAll('_',' ')} · {candidate.signals.map(signal=>signal.replaceAll('_',' ')).join(' · ')}</small></div>)}</div>}<small style={{display:'block',marginTop:10}}>{intake.boundary}</small>{intake.status!=='CLEAR'&&<label style={{display:'flex',gap:8,alignItems:'flex-start',marginTop:10}}><input type="checkbox" checked={intakeConfirmed} onChange={e=>setIntakeConfirmed(e.target.checked)}/><span>I reviewed the matching evidence and still intend to create this draft. Approval and posting remain separate controls.</span></label>}</div>}</section>}

    <section style={panel}><h2 style={{marginTop:0}}>Expense register</h2><div style={{overflowX:'auto'}}><table style={table}><thead><tr><th>No.</th><th>Vendor</th><th>Date</th><th>Status</th><th style={right}>Amount</th><th>Action</th></tr></thead><tbody>{expenses.map(x=><tr key={x.id}><td><b>{x.expenseNumber}</b><br/><small>{x.description}</small></td><td>{x.vendorName}</td><td>{new Date(x.expenseDate).toLocaleDateString('en-IN')}</td><td>{x.status}</td><td style={right}>{money(x.amountPaise)}</td><td>{canManage&&x.status==='DRAFT'?<SecondaryButton onClick={()=>void approveExpense(x)}>Approve</SecondaryButton>:canManage&&x.status==='APPROVED'?<PrimaryButton onClick={()=>void postExpense(x)}>Post</PrimaryButton>:<small>{x.journalEntryId?'Posted to journal':'—'}</small>}</td></tr>)}</tbody></table></div></section>

    <section style={panel}><h2 style={{marginTop:0}}>Payables</h2><div style={{display:'grid',gap:8}}>{payables.map(p=><div key={p.id} style={row}><div><b>{p.vendorName}</b> · {p.expenseNumber}<br/><small>{p.dueDate?`Due ${new Date(p.dueDate).toLocaleDateString('en-IN')}`:'No due date'} · {p.status}</small></div><div style={{display:'flex',gap:10,alignItems:'center'}}><b>{money(p.outstandingPaise)}</b>{canManage&&Number(p.outstandingPaise)>0&&<PrimaryButton onClick={()=>void settlePayable(p)}>Record settlement</PrimaryButton>}</div></div>)}</div></section>

    {canManage&&<section style={panel}><h2 style={{marginTop:0}}>New budget</h2><form onSubmit={createBudget} style={grid}><FormField label="Code" required value={budgetCode} onChange={e=>setBudgetCode(e.target.value)}/><FormField label="Name" required value={budgetName} onChange={e=>setBudgetName(e.target.value)}/><FormField label="Starts" type="date" value={budgetStart} onChange={e=>setBudgetStart(e.target.value)}/><FormField label="Ends" type="date" value={budgetEnd} onChange={e=>setBudgetEnd(e.target.value)}/><SelectField label="Expense account" required value={budgetAccount} onChange={e=>setBudgetAccount(e.target.value)}><option value="">Choose account</option>{expenseAccounts.map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</SelectField><FormField label="Amount (₹)" type="number" min="0" step="0.01" value={budgetAmount} onChange={e=>setBudgetAmount(e.target.value)}/><PrimaryButton type="submit" loading={busy}>Create budget</PrimaryButton></form></section>}

    <section style={panel}><h2 style={{marginTop:0}}>Budgets</h2><div style={{display:'grid',gap:8}}>{budgets.map(b=><div key={b.id} style={row}><div><b>{b.code} · {b.name}</b><br/><small>{new Date(b.startsOn).toLocaleDateString('en-IN')} – {new Date(b.endsOn).toLocaleDateString('en-IN')} · {b.status}</small></div><div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><b>{money(b.budgetPaise)}</b><SecondaryButton onClick={()=>void showActuals(b.id)}>Actuals</SecondaryButton>{canManage&&b.status==='DRAFT'&&<PrimaryButton onClick={()=>void mutate(`/accounting/finance-operations/budgets/${b.id}/approve`)}>Approve</PrimaryButton>}{canManage&&b.status==='APPROVED'&&<PrimaryButton onClick={()=>void mutate(`/accounting/finance-operations/budgets/${b.id}/lock`)}>Lock</PrimaryButton>}</div></div>)}</div>{selectedBudget&&<div style={{marginTop:16}}><h3>Budget vs actual</h3>{actuals.map((a,i)=><div key={`${a.accountId}-${a.fundId??i}`} style={row}><span>{a.accountId}{a.fundId?` · fund ${a.fundId}`:''}</span><span>{money(a.budgetPaise)} budget · <b>{money(a.actualPaise)} actual</b></span></div>)}</div>}</section>

    <section style={panel}><h2 style={{marginTop:0}}>Fund utilization</h2>{funds.length===0?<EmptyState title="No accounting funds configured or utilized"/>:funds.map(f=><div key={f.id} style={row}><span><b>{f.code}</b> · {f.name}</span><b>{money(f.utilizedPaise)}</b></div>)}</section>
    <section style={panel}><h2 style={{marginTop:0}}>Settlement journal helper</h2><p style={{marginTop:0}}>Payable settlements require an already-posted payment journal. Recent posted journals are listed for reference.</p>{journals.filter(j=>j.status==='POSTED').slice(0,12).map(j=><div key={j.id} style={row}><span><b>{j.entryNumber}</b><br/><small>{j.id}</small></span><span>{money(j.debitPaise)}</span></div>)}{liabilityAccounts.length>0&&<small>{liabilityAccounts.length} active liability ledger account{liabilityAccounts.length===1?'':'s'} available for payable approval.</small>}</section>
  </PageShell>
}

const header:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap'}
const panel:React.CSSProperties={marginTop:20,padding:20,border:'1px solid #dbe7ea',borderRadius:16,background:'white'}
const row:React.CSSProperties={display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',padding:'11px 0',borderBottom:'1px solid #eef2f7',flexWrap:'wrap'}
const grid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12,alignItems:'end'}
const notice:React.CSSProperties={marginTop:18,padding:12,border:'1px solid #f59e0b',borderRadius:10,background:'#fffbeb'}
const table:React.CSSProperties={width:'100%',borderCollapse:'collapse'}
const right:React.CSSProperties={textAlign:'right'}
