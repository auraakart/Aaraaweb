'use client'

import { useEffect, useState } from 'react'
import { api, type Session } from '../lib/admin-client'
import type { Notice, Ticket } from '../lib/admin-domain-types'
import type { AdminView as View } from '../lib/admin-access'
import { Empty, Header, Metric } from './admin-ui-primitives'

type WorkforceSummary={inside:number;onLeave:number;pendingVerification:number;longOpenAttendance:{workerId:string;name:string;checkedInAt:string}[]}
type BillingInvoice={status:string;dueDate?:string|null;balancePaise?:number|null;amountPaise?:number|null}
type ReceivableAgeing={currentPaise:string;days1To30Paise:string;days31To60Paise:string;days61To90Paise:string;days90PlusPaise:string}
type ReconciliationCase={status:string;priority?:string;nextAction?:string}
type MigrationReadiness={totalStages:number;committedStages:number;blockedStages:number;readyStages:number;complete:boolean;nextStage:string|null}
type AmenityBooking={status:string}
type OperationsPriority='CRITICAL'|'HIGH'|'NORMAL'
type OperationsQueueItem={priority:OperationsPriority;title:string;whyNow:string;nextAction:string;actionLabel:string;view?:View;href?:string}

export function AdminOverview({session,open,allowedViews}:{session:Session;open:(v:View)=>void;allowedViews:View[]}){
  const[tickets,setTickets]=useState<Ticket[]>([]),[notices,setNotices]=useState<Notice[]>([]),[workforce,setWorkforce]=useState<WorkforceSummary|null>(null),[billing,setBilling]=useState<BillingInvoice[]>([]),[ageing,setAgeing]=useState<ReceivableAgeing|null>(null),[reconciliation,setReconciliation]=useState<ReconciliationCase[]>([]),[migration,setMigration]=useState<MigrationReadiness|null>(null),[amenityPending,setAmenityPending]=useState<AmenityBooking[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
  const canOpen=(view:View)=>allowedViews.includes(view)
  const canReadHelpdesk=['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER'].includes(session.role)
  const canReadNotices=['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER'].includes(session.role)
  const canReadWorkforce=['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER','COMMITTEE_MEMBER','SECURITY_SUPERVISOR','AUDITOR'].includes(session.role)
  const canReadFinance=['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','ACCOUNTANT','AUDITOR'].includes(session.role)
  const canManageAmenities=['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER'].includes(session.role)
  const canManageMigration=['SUPER_ADMIN','SOCIETY_ADMIN'].includes(session.role)
  useEffect(()=>{
    setLoading(true);setError('')
    const tasks=[
      canReadHelpdesk?api<Ticket[]>('/helpdesk/review/queue',{},session).then(setTickets):Promise.resolve(),
      canReadNotices?api<Notice[]>('/notices/manage',{},session).then(setNotices):Promise.resolve(),
      canReadWorkforce?api<WorkforceSummary>('/society-workforce/summary',{},session).then(setWorkforce):Promise.resolve(),
      canOpen('billing')?api<BillingInvoice[]>('/billing/invoices/admin',{},session).then(setBilling):Promise.resolve(),
      canReadFinance?api<ReceivableAgeing[]>('/accounting/receivables/ageing',{},session).then(rows=>setAgeing(rows[0]??null)):Promise.resolve(),
      canReadFinance?api<ReconciliationCase[]>('/accounting/payment-reconciliation/cases',{},session).then(setReconciliation):Promise.resolve(),
      canManageMigration?api<MigrationReadiness>('/migration/readiness',{},session).then(setMigration):Promise.resolve(),
      canManageAmenities?api<AmenityBooking[]>('/amenities/manage/bookings?status=PENDING',{},session).then(setAmenityPending):Promise.resolve(),
    ]
    Promise.allSettled(tasks).then(results=>{
      const coreResults=[canReadHelpdesk?results[0]:null,canReadNotices?results[1]:null].filter((result):result is PromiseSettledResult<unknown>=>result!==null)
      if(coreResults.length>0&&coreResults.every(result=>result.status==='rejected'))setError('Core operations summary could not be loaded.')
    }).finally(()=>setLoading(false))
  },[session,allowedViews,canReadHelpdesk,canReadNotices,canReadWorkforce,canReadFinance,canManageAmenities,canManageMigration])
  const active=tickets.filter(t=>!['RESOLVED','CLOSED'].includes(t.status))
  const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate())
  const overdue=billing.filter(i=>i.status==='ISSUED'&&i.dueDate&&new Date(i.dueDate)<today).length
  const agedReceivablesPaise=ageing?Number(ageing.days1To30Paise)+Number(ageing.days31To60Paise)+Number(ageing.days61To90Paise)+Number(ageing.days90PlusPaise):0
  const openReconciliation=reconciliation.filter(item=>item.status!=='RESOLVED')
  const highReconciliation=openReconciliation.filter(item=>item.priority==='HIGH')
  const agedReceivablesRupees=Math.round(agedReceivablesPaise/100)
  const urgentTickets=active.filter(t=>['URGENT','CRITICAL','HIGH'].includes(t.priority)).length
  const priorityRank:Record<OperationsPriority,number>={CRITICAL:0,HIGH:1,NORMAL:2}
  const operationsQueue:OperationsQueueItem[]=[]
  if(urgentTickets>0)operationsQueue.push({priority:'CRITICAL',title:'Urgent helpdesk',whyNow:`${urgentTickets} active high-priority resident request${urgentTickets===1?'':'s'} require attention.`,nextAction:'Open Helpdesk queue and confirm assignment/escalation.',actionLabel:'Open Helpdesk',view:'helpdesk'})
  if(highReconciliation.length>0)operationsQueue.push({priority:'HIGH',title:'Payment reconciliation',whyNow:`${highReconciliation.length} high-priority reconciliation case${highReconciliation.length===1?'':'s'} remain unresolved.`,nextAction:'Open Finance operations and review the recorded reconciliation evidence.',actionLabel:'Open Finance',href:'/finance'})
  if(workforce&&workforce.longOpenAttendance.length>0)operationsQueue.push({priority:'HIGH',title:'Long-open workforce attendance',whyNow:`${workforce.longOpenAttendance.length} attendance record${workforce.longOpenAttendance.length===1?'':'s'} remain open beyond the normal shift window.`,nextAction:'Review Society Workforce attendance and close/correct only with operator evidence.',actionLabel:'Open workforce',href:'/society-workforce'})
  if(migration&&migration.blockedStages>0)operationsQueue.push({priority:'HIGH',title:'Onboarding blocker',whyNow:`${migration.blockedStages} migration/onboarding stage${migration.blockedStages===1?' is':'s are'} blocked.`,nextAction:`Review onboarding evidence${migration.nextStage?` for ${migration.nextStage.replaceAll('_',' ')}`:''}.`,actionLabel:'Open onboarding',href:'/onboarding'})
  if(overdue>0)operationsQueue.push({priority:'NORMAL',title:'Overdue maintenance invoices',whyNow:`${overdue} issued invoice${overdue===1?' is':'s are'} past due.`,nextAction:'Open Maintenance billing and follow the configured collection workflow.',actionLabel:'Open Billing',view:'billing'})
  if(amenityPending.length>0)operationsQueue.push({priority:'NORMAL',title:'Amenity approvals',whyNow:`${amenityPending.length} booking request${amenityPending.length===1?'':'s'} await an operator decision.`,nextAction:'Open Amenity operations and apply the configured approval policy.',actionLabel:'Open Amenities',href:'/amenities'})
  if(workforce&&workforce.pendingVerification>0)operationsQueue.push({priority:'NORMAL',title:'Workforce verification',whyNow:`${workforce.pendingVerification} society worker${workforce.pendingVerification===1?'':'s'} await verification.`,nextAction:'Review Society Workforce evidence before granting gate eligibility.',actionLabel:'Open workforce',href:'/society-workforce'})
  operationsQueue.sort((a,b)=>priorityRank[a.priority]-priorityRank[b.priority]||a.title.localeCompare(b.title))
return <><Header title="Operations overview" society={session.societyName}/>{error&&<div className="error">{error}</div>}{loading?<section className="panel"><Empty text="Loading operational summary…"/></section>:<><div className="grid">{canReadHelpdesk&&<><Metric label="Open helpdesk" value={active.length}/><Metric label="Urgent tickets" value={active.filter(t=>['URGENT','CRITICAL','HIGH'].includes(t.priority)).length}/></>}{canReadNotices&&<><Metric label="Published notices" value={notices.filter(n=>n.status==='PUBLISHED').length}/><Metric label="Draft notices" value={notices.filter(n=>n.status==='DRAFT').length}/></>}{workforce&&<><Metric label="Workforce inside now" value={workforce.inside}/><Metric label="Workforce on leave" value={workforce.onLeave}/><Metric label="Workforce pending verification" value={workforce.pendingVerification}/><Metric label="Long-open attendance" value={workforce.longOpenAttendance.length}/></>}{canOpen('billing')&&<Metric label="Overdue invoices" value={overdue}/>}
{ageing&&<Metric label="Aged receivables (₹)" value={agedReceivablesRupees}/>} 
{reconciliation.length>0&&<Metric label="Open reconciliation" value={openReconciliation.length}/>}
{amenityPending.length>0&&<Metric label="Amenity approvals" value={amenityPending.length}/>}
{migration&&<Metric label={`Onboarding stages (${migration.totalStages})`} value={migration.committedStages}/>} 
</div>
<section className="panel" aria-labelledby="operations-priority-queue"><b id="operations-priority-queue">Operations priority queue</b>
<p>Deterministic current-state ordering from records this role can already access. It is not predictive scoring and does not mutate any workflow.</p>
{operationsQueue.length===0?<p>No cross-domain operational exception is visible in the currently loaded evidence.</p>:<ol>{operationsQueue.slice(0,8).map(item=><li key={item.title}><strong>{item.priority} · {item.title}</strong><br/><span>Why now: {item.whyNow} Next step: {item.nextAction}</span>{(item.href||!item.view||canOpen(item.view))&&<><br/><button type="button" onClick={()=>{if(item.view&&canOpen(item.view)){open(item.view);return}if(item.href)window.location.href=item.href}}>{item.actionLabel}</button></>}</li>)}</ol>}
</section></>}<div className="actions">{canOpen('residents')&&<button onClick={()=>open('residents')}><b>Owners & occupants</b><span>Manage unit relationships</span></button>}{canOpen('gates')&&<button onClick={()=>open('gates')}><b>Gate operations</b><span>Configure gates and review activity</span></button>}{canOpen('workforce')&&<button onClick={()=>open('workforce')}><b>Domestic-help operations</b><span>Review and control workforce access</span></button>}{['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER','COMMITTEE_MEMBER','SECURITY_SUPERVISOR','AUDITOR'].includes(session.role)&&<button onClick={()=>{window.location.href='/society-workforce'}}><b>Society workforce</b><span>Common workers, shifts and gate attendance</span></button>}{canOpen('marketplace')&&<button onClick={()=>open('marketplace')}><b>Service marketplace</b><span>Approve providers and manage bookings</span></button>}{canOpen('sos')&&<button onClick={()=>open('sos')}><b>SOS response</b><span>Acknowledge and resolve emergencies</span></button>}{canOpen('helpdesk')&&<button onClick={()=>open('helpdesk')}><b>Helpdesk queue</b><span>Review resident issues</span></button>}{canOpen('notices')&&<button onClick={()=>open('notices')}><b>Notice management</b><span>Publish announcements</span></button>}{canOpen('billing')&&<button onClick={()=>open('billing')}><b>Maintenance billing</b><span>Issue and track unit invoices</span></button>}
{['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','ACCOUNTANT','AUDITOR'].includes(session.role)&&<button onClick={()=>{window.location.href='/finance'}}><b>Finance operations</b><span>Review ageing, reconciliation and accounting exceptions</span></button>}
{['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER'].includes(session.role)&&<button onClick={()=>{window.location.href='/amenities'}}><b>Amenity operations</b><span>Review booking policy, approvals and attendance</span></button>}
{['SUPER_ADMIN','SOCIETY_ADMIN'].includes(session.role)&&<button onClick={()=>{window.location.href='/onboarding'}}><b>Society onboarding</b><span>Review migration readiness and setup blockers</span></button>}
</div></>}

