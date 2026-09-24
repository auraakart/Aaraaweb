import { createRoot } from 'react-dom/client'
import HelpdeskAdminPage from '../../app/helpdesk/page'
import PrivacyOperationsPage from '../../app/privacy-operations/page'
import FacilitiesPage from '../../app/facilities/page'
import DocumentsPage from '../../app/documents/page'
import OccupancyLifecyclePage from '../../app/occupancy-lifecycle/page'
import FinanceWorkspace from '../../app/finance/page'
import GovernancePage from '../../app/governance/page'

import '../../app/globals.css'
import '../../app/brand-tokens.css'
import '../../app/admin-navigation.css'
import '../../app/admin-shell.css'
import '../../app/property-workspace.css'

const session={accessToken:'visual-fixture-token',role:'SUPER_ADMIN',societyName:'Aaraagate Visual Society'}
sessionStorage.setItem('aaraagate.admin.session',JSON.stringify(session))

const now='2026-09-20T02:30:00.000Z'
const later='2026-09-22T02:30:00.000Z'
const periodStart='2026-09-01T00:00:00.000Z'
const periodEnd='2026-09-30T23:59:59.000Z'

const fixtures={
  helpdeskTicket:{
    id:'ticket-1',title:'Lift maintenance follow-up',description:'Resident reported intermittent lift stoppage.',
    category:'MAINTENANCE',priority:'HIGH',status:'IN_PROGRESS',unitNumber:'B-402',buildingName:'Tower B',
    createdByName:'Resident Demo',assignedToId:'reviewer-1',assignedToName:'Facility Reviewer',
    slaState:'ON_TRACK',computedSlaState:'ON_TRACK',firstResponseDueAt:later,resolutionDueAt:later,
    escalationLevel:0,escalatedToId:null,escalatedToName:null,
  },
  privacyCase:{
    id:'privacy-1',subjectUserId:'resident-1',subjectName:'Resident Demo',subjectPhone:'+91 90000 00001',
    requestType:'ACCESS',requestSummary:'Request a copy of account data',status:'IN_REVIEW',legalHold:false,
    assignedToUserId:'reviewer-1',assignedToName:'Privacy Reviewer',dueAt:later,createdAt:now,
  },
  facilityAsset:{id:'asset-1',code:'LIFT-B',name:'Tower B Lift',category:'Lift',location:'Tower B',status:'ACTIVE'},
  workOrder:{
    id:'wo-1',assetId:'asset-1',assetCode:'LIFT-B',assetName:'Tower B Lift',workType:'CORRECTIVE',priority:'HIGH',
    title:'Inspect door sensor',description:'Intermittent sensor alert',status:'IN_PROGRESS',dueAt:later,
    assignedUserId:'reviewer-1',assignedUserName:'Facility Reviewer',createdAt:now,
  },
  document:{
    id:'doc-1',title:'Community maintenance policy',description:'Published operating policy',category:'POLICY',
    audience:'ALL_MEMBERS',status:'PUBLISHED',fileName:'maintenance-policy.pdf',mimeType:'application/pdf',
    sizeBytes:184320,version:3,createdAt:now,publishedAt:now,
  },
  lifecycle:{
    id:'move-1',unitId:'unit-1',userId:'resident-1',occupancyId:'occupancy-1',kind:'MOVE_OUT',relation:'TENANT',
    status:'APPROVED',effectiveAt:later,reason:'Relocation',requestedByUserId:'resident-1',reviewedAt:now,createdAt:now,
  },
  governanceMeeting:{
    id:'meeting-1',meetingType:'COMMITTEE',status:'HELD',title:'September committee review',scheduledAt:now,
    heldAt:now,location:'Clubhouse',quorumRequired:4,quorumPresent:5,quorumRuleReference:'Policy Q-1',byeLawReference:'BL-12',
  },
}

function json(data:unknown,status=200){
  return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})
}

window.fetch=async(input,init={})=>{
  const raw=typeof input==='string'?input:input instanceof URL?input.href:input.url
  const url=new URL(raw,window.location.origin)
  const path=url.pathname.replace(/^\/api\/v1/,'')
  const method=(init.method??'GET').toUpperCase()

  if(!url.pathname.startsWith('/api/v1')) return json({ok:true})

  if(path==='/helpdesk/sla/queue') return json([fixtures.helpdeskTicket])
  if(path==='/helpdesk/review/context') return json([{id:'reviewer-1',name:'Facility Reviewer',phone:'+91 90000 00010'}])
  if(path==='/helpdesk/review/ticket-1/activities') return json([{id:'ha-1',type:'STATUS_UPDATED',message:'Work in progress',actorName:'Facility Reviewer',occurredAt:now}])
  if(path==='/helpdesk/sla/ticket-1/history') return json([{id:'hs-1',eventType:'POLICY_APPLIED',toState:'ON_TRACK',actorName:'System',createdAt:now}])
  if(path==='/helpdesk/sla/ticket-1/readiness') return json({
    ticketId:'ticket-1',status:'IN_PROGRESS',priority:'HIGH',assigned:true,computedSlaState:'ON_TRACK',
    firstResponded:true,firstResponseDueAt:later,resolutionDueAt:later,escalationLevel:0,escalated:false,critical:false,
    blockers:[],nextActions:['Continue resident update cadence'],
    policy:{firstResponseMinutes:60,resolutionMinutes:480,escalationAfterMinutes:240,automaticEscalationEnabled:true,escalationTargetUserId:'reviewer-1',escalationTargetName:'Facility Reviewer'},
    boundary:'Readiness is descriptive; server authorization remains authoritative.',
  })

  if(path==='/privacy/cases') return json([fixtures.privacyCase])
  if(path==='/privacy/operator-context') return json({
    subjects:[{id:'resident-1',name:'Resident Demo',phone:'+91 90000 00001',relationship:'TENANT'}],
    assignees:[{id:'reviewer-1',name:'Privacy Reviewer',phone:'+91 90000 00011'}],
  })
  if(path==='/privacy/program-readiness') return json({
    status:'READY',
    blockers:[],
    nextActions:[],
    metrics:{
      activeDataCategories:5,
      categoriesMissingLegalBasis:0,
      categoriesMissingRetention:0,
      activeProcessors:2,
      processorsMissingAgreementReference:0,
      overdueCases:0,
      openSecurityIncidents:0,
      grievanceContactActive:true,
    },
    boundary:'Operational readiness evidence only; this fixture does not certify statutory compliance.',
  })
  if(path==='/privacy/cases/privacy-1/history') return json([{id:'ph-1',eventType:'STATUS_UPDATED',summary:'Case moved to review',createdAt:now,actorName:'Privacy Reviewer'}])
  if(path==='/privacy/cases/privacy-1/readiness') return json({
    caseId:'privacy-1',requestType:'ACCESS',status:'IN_REVIEW',assigned:true,dueAt:later,overdue:false,blockers:[],
    nextActions:['Prepare server-authorized access export'],
    privacyProgramContext:{activeDataCategories:5,activeProcessors:2,openSecurityIncidents:0,grievanceContactActive:true},
    boundary:'Readiness describes repository evidence; legal interpretation remains external.',
  })

  if(path==='/facilities/assets') return json([fixtures.facilityAsset])
  if(path==='/facilities/work-orders') return json([fixtures.workOrder])
  if(path==='/facilities/operator-context') return json([{id:'reviewer-1',name:'Facility Reviewer',phone:'+91 90000 00010'}])
  if(path==='/facilities/work-orders/wo-1/events') return json([{id:'fe-1',eventType:'STATUS_CHANGED',fromStatus:'OPEN',toStatus:'IN_PROGRESS',actorName:'Facility Reviewer',occurredAt:now}])

  if(path==='/documents/management') return json([fixtures.document])
  if(path==='/documents/management/context') return json([{id:'unit-1',number:'B-402',building:{id:'building-1',name:'Tower B',code:'B'}}])
  if(path==='/documents/management/doc-1/history') return json([{id:'de-1',eventType:'PUBLISHED',fromStatus:'DRAFT',toStatus:'PUBLISHED',actorName:'Society Admin',createdAt:now}])

  if(path==='/occupancy-lifecycle') return json([fixtures.lifecycle])
  if(path==='/occupancy-lifecycle/operator-context') return json({
    units:[{id:'unit-1',number:'B-402',building:{id:'building-1',name:'Tower B',code:'B'}}],
    occupancies:[{id:'occupancy-1',relation:'TENANT',effectiveFrom:'2026-01-01T00:00:00.000Z',user:{id:'resident-1',name:'Resident Demo',phone:'+91 90000 00001',status:'ACTIVE'},unit:{id:'unit-1',number:'B-402',building:{id:'building-1',name:'Tower B',code:'B'}}}],
  })
  if(path==='/occupancy-lifecycle/move-1') return json({...fixtures.lifecycle,events:[{id:'oe-1',eventType:'REQUEST_APPROVED',actorUserId:'admin-1',note:'Move-out approved',createdAt:now}],checklist:[{id:'oc-1',code:'KEYS',label:'Return keys',required:true,completedAt:now,note:'Received'}],documents:[{id:'od-1',kind:'TENANCY_AGREEMENT',fileReference:'agreement.pdf',verifiedAt:now,note:'Verified'}]})
  if(path==='/occupancy-lifecycle/move-1/readiness') return json({
    requestId:'move-1',kind:'MOVE_OUT',checklist:{total:1,required:1,completedRequired:1,mandatoryReady:true},
    documents:{total:1,verified:1},handover:{activeVehicles:0,activeWorkforceAssignments:0,activeParkingAllocations:0,gateAuthority:{primaryGateContact:true,gateApprovalEnabled:true,gateNotificationEnabled:true}},
    boundary:'Readiness is descriptive and does not replace society policy or legal verification.',
  })

  if(path==='/accounting/receivables') return json([{id:'recv-1',unitId:'unit-1',receivableNumber:'INV-2026-09-001',billingPeriod:'2026-09',description:'Monthly maintenance',amountPaise:'350000',outstandingPaise:'125000',dueDate:'2026-09-25T00:00:00.000Z',status:'PARTIALLY_PAID',issuedAt:now}])
  if(path.startsWith('/accounting/receivables/ageing')) return json({currentPaise:'125000',days1To30Paise:'0',days31To60Paise:'0',days61To90Paise:'0',days90PlusPaise:'0'})
  if(path==='/accounting/receivables/charge-rules') return json([{id:'rule-1',code:'MAINT',name:'Maintenance',frequency:'MONTHLY',amountPaise:'350000',lateFeeMode:'FIXED',graceDays:5,active:true}])
  if(path==='/accounting/journals') return json([{id:'journal-1',entryNumber:'JV-2026-09-001',entryDate:now,description:'Maintenance billing',status:'POSTED',debitPaise:'350000',creditPaise:'350000',postedAt:now}])
  if(path==='/accounting/periods') return json([{id:'period-1',code:'SEP-26',name:'September 2026',startsOn:periodStart,endsOn:periodEnd,status:'OPEN'}])
  if(path==='/accounting/late-fees/batches') return json([])
  if(path==='/accounting/late-fees/unapplied-cash') return json({paymentCount:0,totalCapturedPaise:'0',totalAllocatedPaise:'0',totalUnappliedPaise:'0',payments:[]})
  if(path==='/accounting/periods/period-1/close-readiness') return json({period:{id:'period-1',code:'SEP-26',name:'September 2026',startsOn:periodStart,endsOn:periodEnd,status:'OPEN'},journalSummary:{draftCount:0,postedCount:1,reversedCount:0,debitPaise:'350000',creditPaise:'350000',balanced:true},blockers:[],readyToClose:true})
  if(path.startsWith('/accounting/reports/trial-balance')) return json([{accountId:'acc-1',code:'1100',name:'Receivables',type:'ASSET',debitPaise:'125000',creditPaise:'0',netDebitPaise:'125000'}])
  if(path.startsWith('/accounting/reports/income-expense')) return json([{accountId:'acc-2',code:'4100',name:'Maintenance income',type:'INCOME',debitPaise:'0',creditPaise:'350000',amountPaise:'350000'}])
  if(path.startsWith('/accounting/reports/balance-sheet')) return json({asOf:'2026-09-30',accounts:[],currentResultPaise:'350000',assetTotalPaise:'125000',liabilityTotalPaise:'0',equityTotalPaise:'125000',balanceCheckPaise:'0'})
  if(path.startsWith('/accounting/reports/fund-statement')) return json([{fundId:'fund-1',code:'GENERAL',name:'General fund',restricted:false,openingNetDebitPaise:'0',periodDebitPaise:'350000',periodCreditPaise:'225000',closingNetDebitPaise:'125000'}])

  if(path==='/governance/committee') return json([{id:'tenure-1',userId:'committee-1',userName:'Committee Secretary',userPhone:'+91 90000 00020',roleName:'Secretary',effectiveFrom:'2026-04-01T00:00:00.000Z',effectiveTo:null,handoverNotes:null}])
  if(path==='/governance/meetings') return json([fixtures.governanceMeeting])
  if(path==='/governance/meetings/meeting-1') return json({...fixtures.governanceMeeting,minutesSummary:'Reviewed maintenance, collections and resident communications.',agenda:[{id:'ga-1',ordinal:1,title:'Maintenance review',description:'Lift and pump maintenance'}],resolutions:[{id:'gr-1',title:'Approve preventive maintenance budget',resolutionText:'Approve preventive maintenance spend for Q4.',status:'PASSED',approvalRequired:4,approvalRecorded:5,approvalRuleReference:'Policy A-1',byeLawReference:'BL-12'}],actions:[{id:'gact-1',title:'Publish maintenance calendar',description:'Share quarterly schedule',ownerUserId:'committee-1',dueAt:later,status:'IN_PROGRESS'}],evidence:[{id:'ge-1',eventType:'OUTCOME_RECORDED',summary:'Meeting outcome and minutes recorded',createdAt:now}]})

  if(method!=='GET') return json({ok:true})
  return json([])
}

const route=new URLSearchParams(window.location.search).get('route')??'helpdesk'
const pages={
  helpdesk:<HelpdeskAdminPage/>,
  privacy:<PrivacyOperationsPage/>,
  facilities:<FacilitiesPage/>,
  documents:<DocumentsPage/>,
  occupancy:<OccupancyLifecyclePage/>,
  finance:<FinanceWorkspace/>,
  governance:<GovernancePage/>,
}
const page=route in pages?pages[route as keyof typeof pages]:pages.helpdesk
createRoot(document.getElementById('root')!).render(page)
