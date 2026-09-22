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

export function AdminOverview({session,open,allowedViews}:{session:Session;open:(v:View)=>void;allowedViews:View[]}){
  const[tickets,setTickets]=useState<Ticket[]>([]),[notices,setNotices]=useState<Notice[]>([]),[workforce,setWorkforce]=useState<WorkforceSummary|null>(null),[billing,setBilling]=useState<BillingInvoice[]>([]),[ageing,setAgeing]=useState<ReceivableAgeing|null>(null),[reconciliation,setReconciliation]=useState<ReconciliationCase[]>([]),[migration,setMigration]=useState<MigrationReadiness|null>(null),[amenityPending,setAmenityPending]=useState<AmenityBooking[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
  const canOpen=(view:View)=>allowedViews.includes(view)
  useEffect(()=>{
    setLoading(true);setError('')
    const canReadWorkforce=['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER','COMMITTEE_MEMBER','SECURITY_SUPERVISOR','AUDITOR'].includes(session.role)
    const canReadFinance=['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','ACCOUNTANT','AUDITOR'].includes(session.role)
    const canManageAmenities=['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER'].includes(session.role)
    const canManageMigration=['SUPER_ADMIN','SOCIETY_ADMIN'].includes(session.role)
    const tasks=[
      api<Ticket[]>('/helpdesk/review/queue',{},session).then(setTickets),
      api<Notice[]>('/notices/manage',{},session).then(setNotices),
      canReadWorkforce?api<WorkforceSummary>('/society-workforce/summary',{},session).then(setWorkforce):Promise.resolve(),
      canOpen('billing')?api<BillingInvoice[]>('/billing/invoices/admin',{},session).then(setBilling):Promise.resolve(),
      canReadFinance?api<ReceivableAgeing[]>('/accounting/receivables/ageing',{},session).then(rows=>setAgeing(rows[0]??null)):Promise.resolve(),
      canReadFinance?api<ReconciliationCase[]>('/accounting/payment-reconciliation/cases',{},session).then(setReconciliation):Promise.resolve(),
      canManageMigration?api<MigrationReadiness>('/migration/readiness',{},session).then(setMigration):Promise.resolve(),
      canManageAmenities?api<AmenityBooking[]>('/amenities/manage/bookings?status=PENDING',{},session).then(setAmenityPending):Promise.resolve(),
    ]
    Promise.allSettled(tasks).then(results=>{
      if(results[0].status==='rejected'&&results[1].status==='rejected')setError('Core operations summary could not be loaded.')
    }).finally(()=>setLoading(false))
  },[session,allowedViews])
  const active=tickets.filter(t=>!['RESOLVED','CLOSED'].includes(t.status))
  const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate())
  const overdue=billing.filter(i=>i.status==='ISSUED'&&i.dueDate&&new Date(i.dueDate)<today).length
  const agedReceivablesPaise=ageing?Number(ageing.days1To30Paise)+Number(ageing.days31To60Paise)+Number(ageing.days61To90Paise)+Number(ageing.days90PlusPaise):0
  const openReconciliation=reconciliation.filter(item=>item.status!=='RESOLVED')
  const highReconciliation=openReconciliation.filter(item=>item.priority==='HIGH')
  const agedReceivablesRupees=Math.round(agedReceivablesPaise/100)
return <><Header title="Operations overview" society={session.societyName}/>{error&&<div className="error">{error}</div>}{loading?<section className="panel"><Empty text="Loading operational summary…"/></section>:<><div className="grid"><Metric label="Open helpdesk" value={active.length}/><Metric label="Urgent tickets" value={active.filter(t=>['URGENT','CRITICAL','HIGH'].includes(t.priority)).length}/><Metric label="Published notices" value={notices.filter(n=>n.status==='PUBLISHED').length}/><Metric label="Draft notices" value={notices.filter(n=>n.status==='DRAFT').length}/>{workforce&&<><Metric label="Workforce inside now" value={workforce.inside}/><Metric label="Workforce on leave" value={workforce.onLeave}/><Metric label="Workforce pending verification" value={workforce.pendingVerification}/><Metric label="Long-open attendance" value={workforce.longOpenAttendance.length}/></>}{canOpen('billing')&&<Metric label="Overdue invoices" value={overdue}/>}
{ageing&&<Metric label="Aged receivables (₹)" value={agedReceivablesRupees}/>} 
{reconciliation.length>0&&<Metric label="Open reconciliation" value={openReconciliation.length}/>}
{amenityPending.length>0&&<Metric label="Amenity approvals" value={amenityPending.length}/>}
{migration&&<Metric label={`Onboarding stages (${migration.totalStages})`} value={migration.committedStages}/>} 
</div>
{(workforce?.longOpenAttendance.length||highReconciliation.length||amenityPending.length||migration?.blockedStages)&&<section className="panel"><b>Needs operations review</b>
{workforce&&workforce.longOpenAttendance.length>0&&<p>{workforce.longOpenAttendance.slice(0,5).map(x=>x.name).join(', ')} have long-open workforce attendance records.</p>}
{highReconciliation.length>0&&<p>{highReconciliation.length} payment reconciliation case{highReconciliation.length===1?'':'s'} require high-priority finance review.</p>}
{amenityPending.length>0&&<p>{amenityPending.length} amenity booking request{amenityPending.length===1?'':'s'} await approval.</p>}
{migration&&migration.blockedStages>0&&<p>{migration.blockedStages} onboarding stage{migration.blockedStages===1?' is':'s are'} blocked. Next stage: {migration.nextStage?.replaceAll('_',' ')??'review migration evidence'}.</p>}
</section>}</>}<div className="actions">{canOpen('residents')&&<button onClick={()=>open('residents')}><b>Owners & occupants</b><span>Manage unit relationships</span></button>}{canOpen('gates')&&<button onClick={()=>open('gates')}><b>Gate operations</b><span>Configure gates and review activity</span></button>}{canOpen('workforce')&&<button onClick={()=>open('workforce')}><b>Domestic-help operations</b><span>Review and control workforce access</span></button>}{['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER','COMMITTEE_MEMBER','SECURITY_SUPERVISOR','AUDITOR'].includes(session.role)&&<button onClick={()=>{window.location.href='/society-workforce'}}><b>Society workforce</b><span>Common workers, shifts and gate attendance</span></button>}{canOpen('marketplace')&&<button onClick={()=>open('marketplace')}><b>Service marketplace</b><span>Approve providers and manage bookings</span></button>}{canOpen('sos')&&<button onClick={()=>open('sos')}><b>SOS response</b><span>Acknowledge and resolve emergencies</span></button>}{canOpen('helpdesk')&&<button onClick={()=>open('helpdesk')}><b>Helpdesk queue</b><span>Review resident issues</span></button>}{canOpen('notices')&&<button onClick={()=>open('notices')}><b>Notice management</b><span>Publish announcements</span></button>}{canOpen('billing')&&<button onClick={()=>open('billing')}><b>Maintenance billing</b><span>Issue and track unit invoices</span></button>}</div></>}

