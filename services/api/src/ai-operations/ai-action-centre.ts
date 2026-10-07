import { AppRole } from '../auth/auth.types';
import { AppPermission, hasPermission } from '../auth/permission.types';
import { AiCopilot } from './ai-copilot';
import { AiOperationsService } from './ai-operations.service';
import { AiSocietyInsights } from './ai-society-insights';

export class AiActionCentre {
  constructor(
    private readonly operations: AiOperationsService,
    private readonly insights: AiSocietyInsights,
    private readonly copilot: AiCopilot,
  ) {}

  async build(societyId:string,roles:readonly AppRole[]) {
    const cards:Array<{
      id:string;domain:string;severity:'LOW'|'MEDIUM'|'HIGH';title:string;summary:string;prompt:string;sources:string[];metrics:Record<string,number|string|null>;whyNow?:string;recommendedNextStep?:string;likelyCause?:string;safeWorkflow?:string[];
      proposalOption?:{action:'ASSIGN_HELPDESK_TICKET';subjectId:string;label:string;requiresHumanInput:true;requiresConfirmation:true;autonomousExecution:false};
    }>=[];

    if(hasPermission(roles,AppPermission.FINANCE_READ)){
      const finance=await this.insights.societyFinance(societyId,0);
      cards.push({
        id:'finance-overdue',domain:'FINANCE',
        severity:finance.overdueOver30Days>0?'HIGH':finance.overdueCount>0?'MEDIUM':'LOW',
        title:'Collections and overdue maintenance',
        summary:finance.overdueCount>0
          ? `${finance.overdueCount} overdue invoices · ${finance.overdueOver30Days} older than 30 days`
          : 'No overdue maintenance invoices in current society data.',
        prompt:'Show overdue maintenance and collection trend',
        sources:['MaintenanceInvoice','Payment'],
        metrics:{overdueCount:finance.overdueCount,overduePaise:finance.overduePaise,over30Days:finance.overdueOver30Days,collections30dPaise:finance.collections30dPaise,previous30dPaise:finance.previous30dPaise,collectionChangePercent:finance.collectionChangePercent},
        likelyCause:finance.overdueOver30Days>0
          ? 'Long-ageing receivables are the strongest current collection signal.'
          : finance.collectionChangePercent!==null&&finance.collectionChangePercent<0
            ? 'Recent collections are below the previous 30-day period.'
            : 'Current evidence does not indicate a material collection deterioration.',
        safeWorkflow:['Review ageing buckets and reconciliation exceptions','Confirm reminder/waiver policy before any resident communication','Keep payment and accounting corrections in their existing controlled workflows'],
      });
    }

    if(hasPermission(roles,AppPermission.HELPDESK_REVIEW)){
      const helpdesk=await this.operations.operationsSummary(societyId);
      cards.push({
        id:'helpdesk-sla',domain:'HELPDESK',
        severity:helpdesk.breachedCount>0?'HIGH':helpdesk.unassignedCount>0?'MEDIUM':'LOW',
        title:'Helpdesk SLA attention',
        summary:helpdesk.breachedCount>0
          ? `${helpdesk.breachedCount} breached · ${helpdesk.unassignedCount} unassigned`
          : `${helpdesk.openCount} open · ${helpdesk.unassignedCount} unassigned`,
        prompt:'Show helpdesk SLA breaches and unassigned tickets',
        sources:['HelpdeskTicket'],
        metrics:{openCount:helpdesk.openCount,breachedCount:helpdesk.breachedCount,unassignedCount:helpdesk.unassignedCount},
        likelyCause:helpdesk.breachedCount>0
          ? 'SLA-breached requests indicate unresolved work has exceeded configured response or resolution expectations.'
          : helpdesk.unassignedCount>0
            ? 'Unassigned requests are the clearest current routing bottleneck.'
            : 'No material helpdesk bottleneck is visible in current evidence.',
        safeWorkflow:['Review breached requests first','Assign an accountable operator where missing','Use the normal status/escalation workflow; AI does not close or reassign tickets'],
        ...(helpdesk.unassigned?.[0]?.id?{proposalOption:{
          action:'ASSIGN_HELPDESK_TICKET' as const,
          subjectId:String(helpdesk.unassigned[0].id),
          label:'Prepare assignment for oldest unassigned ticket',
          requiresHumanInput:true as const,
          requiresConfirmation:true as const,
          autonomousExecution:false as const,
        }}:{}),
      });
    }

    if(hasPermission(roles,AppPermission.GATE_ACCESS_PROCESS)){
      const gate=await this.insights.gateAttentionSummary(societyId);
      const focus=gate.criticalIncidentTitle
        ? `Critical incident: ${gate.criticalIncidentTitle}`
        : gate.oldestOverstayName
          ? `Oldest overstay: ${gate.oldestOverstayName}${gate.oldestOverstayMinutes!==null?` · ${gate.oldestOverstayMinutes} min`:''}`
          : gate.staleCheckpointName
            ? `Patrol due: ${gate.staleCheckpointName}`
            : null;
      cards.push({
        id:'gate-attention',domain:'GATE',
        severity:gate.criticalIncidents>0||gate.overstayCount>0?'HIGH':gate.stalePatrolCount>0?'MEDIUM':'LOW',
        title:'Gate attention and patrol coverage',
        summary:gate.overstayCount||gate.openIncidents||gate.stalePatrolCount
          ? `${gate.overstayCount} overstays · ${gate.openIncidents} open incidents · ${gate.stalePatrolCount} patrol checkpoints due${focus?` · ${focus}`:''}`
          : 'Gate exceptions and patrol coverage are currently clear.',
        prompt:'Show gate overstays, incidents and patrol coverage needing attention',
        sources:['AccessRequest','SecurityIncident','PatrolCheckpoint','PatrolScan'],
        metrics:{
          overstayCount:gate.overstayCount,openIncidents:gate.openIncidents,criticalIncidents:gate.criticalIncidents,stalePatrolCount:gate.stalePatrolCount,
          criticalIncidentId:gate.criticalIncidentId,oldestOverstayId:gate.oldestOverstayId,staleCheckpointId:gate.staleCheckpointId,
        },
        whyNow:gate.criticalIncidentTitle
          ? `Critical incident "${gate.criticalIncidentTitle}" is still open and requires supervisor attention.`
          : gate.oldestOverstayName
            ? `${gate.oldestOverstayName} is the oldest checked-in visitor beyond the four-hour operating threshold${gate.oldestOverstayMinutes!==null?` at ${gate.oldestOverstayMinutes} minutes`:''}.`
            : gate.staleCheckpointName
              ? `${gate.staleCheckpointName} has no patrol scan in the last eight hours.`
              : 'No immediate gate exception signal is present.',
        recommendedNextStep:gate.criticalIncidentId
          ? 'Open Security Incidents, review the critical record and record the supervisor response.'
          : gate.oldestOverstayId
            ? 'Verify the oldest visitor status and escalate it from Guard Field Operations if unresolved.'
            : gate.staleCheckpointId
              ? 'Prioritise a patrol scan for the named checkpoint.'
              : 'Continue routine gate processing and patrol cadence.',
        likelyCause:gate.criticalIncidentId
          ? 'An unresolved critical security incident is driving the gate priority.'
          : gate.oldestOverstayId
            ? 'A checked-in visitor has exceeded the configured four-hour operating threshold.'
            : gate.staleCheckpointId
              ? 'Patrol evidence is stale for at least one active checkpoint.'
              : 'No active gate exception is driving attention.',
        safeWorkflow:['Verify the named record against live gate context','Escalate through Guard/Security Supervisor controls when required','Do not bypass resident approval or device/manual-fallback policy'],
      });
    }

    if(hasPermission(roles,AppPermission.AUDIT_READ)){
      const security=await this.insights.securitySummary(societyId);
      const total=security.byType.reduce((sum,item)=>sum+Number(item.count),0);
      cards.push({
        id:'security-events',domain:'SECURITY',
        severity:total>20?'HIGH':total>0?'MEDIUM':'LOW',
        title:'Security events',
        summary:total>0?`${total} privacy-minimal security events in the last 30 days`:'No security events recorded in the last 30 days.',
        prompt:'Summarize recent security incidents and session events',
        sources:['SecurityEvent'],
        metrics:{eventCount30d:total},
        likelyCause:total>20?'Security-event volume is elevated for the current 30-day window; inspect the event mix before attributing a cause.':'No elevated security-event volume is currently indicated.',
        safeWorkflow:['Inspect event types and timestamps','Correlate only with authorized audit evidence','Avoid inferring resident intent or identity beyond recorded evidence'],
      });
    }

    if(hasPermission(roles,AppPermission.FACILITIES_READ)){
      const facilities=await this.insights.facilitiesSummary(societyId);
      cards.push({
        id:'facilities-risk',domain:'FACILITIES',
        severity:facilities.overdueWorkOrders>0||facilities.repeatedCorrectiveAssets90d>0?'HIGH':facilities.maintenanceDue30d>0||facilities.warrantiesExpiring60d>0?'MEDIUM':'LOW',
        title:'Facility maintenance',
        summary:`${facilities.openWorkOrders} open · ${facilities.overdueWorkOrders} overdue · ${facilities.repeatedCorrectiveAssets90d} assets with repeated corrective work · ${facilities.warrantiesExpiring60d} warranties ≤60 days`,
        prompt:'Show facility work orders, recurring corrective work, warranty attention and AMCs',
        sources:['FacilityAsset','FacilityWorkOrder','FacilityMaintenancePlan'],
        metrics:{
          openWorkOrders:facilities.openWorkOrders,
          overdueWorkOrders:facilities.overdueWorkOrders,
          maintenanceDue30d:facilities.maintenanceDue30d,
          repeatedCorrectiveAssets90d:facilities.repeatedCorrectiveAssets90d,
          warrantiesExpiring60d:facilities.warrantiesExpiring60d,
        },
        likelyCause:facilities.overdueWorkOrders>0
          ? 'Overdue work orders are the primary current facilities-attention signal.'
          : facilities.repeatedCorrectiveAssets90d>0
            ? 'Repeated corrective work indicates recurring recorded maintenance activity; the underlying physical cause is not inferred.'
            : facilities.warrantiesExpiring60d>0
              ? 'Recorded warranty dates are approaching and should be reviewed before expiry.'
              : facilities.maintenanceDue30d>0
                ? 'Upcoming preventive-maintenance obligations require scheduling attention.'
                : 'No current facility backlog or recurring-work signal is elevated.',
        safeWorkflow:['Review critical, overdue and recurring work-order evidence','Confirm assignee, warranty and AMC evidence','Use existing inspection, facility completion and escalation controls; do not infer a physical root cause from history alone'],
      });
    }

    if(hasPermission(roles,AppPermission.GOVERNANCE_READ)){
      const governance=await this.insights.governanceSummary(societyId);
      const openActions=governance.actions.filter(action=>!['COMPLETED','CLOSED','CANCELLED'].includes(String(action.status??'').toUpperCase()));
      const now=Date.now();
      const overdueActions=openActions.filter(action=>{
        const dueAt=action.dueAt;
        if(!dueAt)return false;
        const due=Date.parse(String(dueAt));
        return Number.isFinite(due)&&due<now;
      });
      cards.push({
        id:'governance-actions',domain:'GOVERNANCE',
        severity:overdueActions.length>0?'HIGH':openActions.length>0?'MEDIUM':'LOW',
        title:'Governance follow-through',
        summary:openActions.length>0
          ? `${openActions.length} open action items · ${overdueActions.length} overdue`
          : 'No open governance action items in current society data.',
        prompt:'Show governance action items needing follow-through',
        sources:['GovernanceMeeting','GovernanceResolution','GovernanceActionItem'],
        metrics:{openActionItems:openActions.length,overdueActionItems:overdueActions.length},
        likelyCause:overdueActions.length>0?'Governance follow-through is delayed on one or more dated action items.':openActions.length>0?'Open governance actions still require accountable follow-through.':'No governance action backlog is visible.',
        safeWorkflow:['Review the underlying meeting/resolution evidence','Confirm owner and due date','Record completion only through the governance workflow'],
      });
    }

    if(hasPermission(roles,AppPermission.SOCIETY_VENDORS_READ)){
      const vendors=await this.insights.vendorSummary(societyId);
      cards.push({
        id:'procurement-attention',domain:'PROCUREMENT',
        severity:vendors.submittedRequests>=5?'HIGH':vendors.submittedRequests>0?'MEDIUM':'LOW',
        title:'Procurement and vendors',
        summary:`${vendors.submittedRequests} submitted requests · ${vendors.approvedRequests} approved · ${vendors.activeVendors} active vendors`,
        prompt:'Show vendor and procurement requests needing attention',
        sources:['SocietyVendor','ProcurementRequest'],
        metrics:{activeVendors:vendors.activeVendors,submittedRequests:vendors.submittedRequests,approvedRequests:vendors.approvedRequests},
        likelyCause:vendors.submittedRequests>0?'Submitted procurement requests are awaiting the next controlled review/approval step.':'No procurement queue signal is currently elevated.',
        safeWorkflow:['Review submitted requests and supporting quotations','Apply maker-checker/approval policy','Keep vendor and marketplace responsibilities segregated'],
      });
    }

    const workspaceByDomain:Record<string,{href:string;label:string}>={
      FINANCE:{href:'/finance',label:'Finance workspace'},
      HELPDESK:{href:'/helpdesk',label:'Helpdesk operations'},
      GATE:{href:'/emergency-operations',label:'Gate operations'},
      SECURITY:{href:'/emergency-operations',label:'Security operations'},
      FACILITIES:{href:'/facilities/health',label:'Facilities workspace'},
      GOVERNANCE:{href:'/governance',label:'Governance workspace'},
      PROCUREMENT:{href:'/society-vendors',label:'Vendor & procurement workspace'},
    };
    const baselines=cards.length>0?await this.copilot.societyBaselines(societyId):null;
    const baselineFor=(card:(typeof cards)[number])=>{
      if(!baselines)return null;
      if(card.domain==='HELPDESK')return baselines.helpdesk;
      if(card.domain==='FACILITIES')return baselines.facilities;
      if(card.domain==='SECURITY')return baselines.security;
      if(card.domain==='GATE')return baselines.gate;
      if(card.domain==='FINANCE')return {
        metric:'collections / 30d',
        current:Number(card.metrics.collections30dPaise??0),
        typical:Number(card.metrics.previous30dPaise??0),
        changePercent:card.metrics.collectionChangePercent,
        confidence:Number(card.metrics.collections30dPaise??0)+Number(card.metrics.previous30dPaise??0)>0?'HIGH':'LOW',
        basis:'SOCIETY_HISTORY',
        window:'current 30 days vs immediately preceding 30 days',
      };
      return null;
    };
    const stagedCards=cards.map(card=>{
      const recommendationKey=this.copilot.fingerprint(card);
      const graded=this.copilot.evidence(card.sources,card.metrics);
      return {
        ...card,
        recommendationKey,
        baseline:baselineFor(card),
        actionIntent:{
          mode:'READ_ONLY_DRILLDOWN' as const,
          workspaceHref:workspaceByDomain[card.domain]?.href??'/',
          workspaceLabel:workspaceByDomain[card.domain]?.label??'Operations workspace',
          confirmationRequired:true as const,
          mutationAllowed:false as const,
        },
        evidenceQuality:{
          confidence:graded.confidence,
          sourceCount:graded.sourceCount,
          recordCount:graded.recordCount,
          asOf:graded.asOf,
          basis:'CURRENT_QUERY_SNAPSHOT' as const,
          causalClaim:false as const,
          interpretation:(card.likelyCause?'DETERMINISTIC_SIGNAL_NOT_CAUSAL_PROOF':'FACT_SUMMARY') as 'DETERMINISTIC_SIGNAL_NOT_CAUSAL_PROOF'|'FACT_SUMMARY',
        },
      };
    });
    const outcomes=await this.copilot.latestOutcomes(societyId,stagedCards.map(card=>card.recommendationKey));
    const evidenceCards=stagedCards.map(card=>({...card,lastOutcome:outcomes.get(card.recommendationKey)??null}));
    const rank={HIGH:0,MEDIUM:1,LOW:2} as const;
    const safetyRank=(card:(typeof evidenceCards)[number])=>card.id==='gate-attention'&&Number(card.metrics.criticalIncidents??0)>0?0:1;
    evidenceCards.sort((a,b)=>rank[a.severity]-rank[b.severity]||safetyRank(a)-safetyRank(b)||a.domain.localeCompare(b.domain));
    const highPriorityCount=evidenceCards.filter(card=>card.severity==='HIGH').length;
    const mediumPriorityCount=evidenceCards.filter(card=>card.severity==='MEDIUM').length;
    const focus=evidenceCards[0]??null;
    const hypotheses=this.copilot.hypotheses({
      HELPDESK_OPERATIONS:evidenceCards.find(card=>card.domain==='HELPDESK')?.metrics,
      FACILITIES:evidenceCards.find(card=>card.domain==='FACILITIES')?.metrics,
      VENDORS:evidenceCards.find(card=>card.domain==='PROCUREMENT')?.metrics,
    });
    return {
      cards:evidenceCards,
      hypotheses,
      brief:{
        highPriorityCount,
        mediumPriorityCount,
        attentionCount:highPriorityCount+mediumPriorityCount,
        topPriorities:evidenceCards.slice(0,3).map(card=>({
          recommendationKey:card.recommendationKey,
          domain:card.domain,title:card.title,severity:card.severity,
          whyNow:card.whyNow??card.summary,
          recommendedNextStep:card.recommendedNextStep??'Open the relevant operational workspace and review the grounded evidence.',
          evidenceQuality:card.evidenceQuality,baseline:card.baseline,lastOutcome:card.lastOutcome,
        })),
        recommendedFocus:focus?{
          recommendationKey:focus.recommendationKey,domain:focus.domain,title:focus.title,prompt:focus.prompt,
          whyNow:focus.whyNow??focus.summary,
          recommendedNextStep:focus.recommendedNextStep??'Open the relevant operational workspace and review the grounded evidence.',
          likelyCause:focus.likelyCause??'No deterministic cause signal is available.',
          safeWorkflow:focus.safeWorkflow??['Review the grounded evidence in the relevant workspace'],
          actionIntent:focus.actionIntent,evidenceQuality:focus.evidenceQuality,baseline:focus.baseline,lastOutcome:focus.lastOutcome,
        }:null,
        explanation:'Priority is deterministic from the current permission-scoped evidence snapshot. Likely-cause text is a signal interpretation, not causal proof, and no autonomous mutation is performed. Society-history baselines add context without weakening safety defaults. Hypotheses show supporting and contradicting evidence and are never causal proof.',
      },
      generatedAt:new Date().toISOString(),grounded:true,mutationPerformed:false
    };
  }


}
