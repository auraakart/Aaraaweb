import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppRole } from '../auth/auth.types';
import { AppPermission, hasPermission } from '../auth/permission.types';
import { canReadPropertyPayables } from '../auth/property-finance-access';
import { currentResidentPropertySql } from '../auth/property-scope.sql';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceService } from '../workforce/workforce.service';
import { DocumentsService } from '../documents/documents.service';
import { AiOperationsService } from './ai-operations.service';
import { AiSocietyInsights } from './ai-society-insights';

export { residentIntentRoutingText } from './ai-assistant.policy';
export type { AiAssistantIntent, AiAssistantToolId } from './ai-assistant.policy';
import {
  AI_ASSISTANT_TOOLS,
  amountThresholdPaise,
  promptInjectionAttempt,
  residentIntentRoutingText,
  type AiAssistantIntent,
  type AiAssistantToolDefinition,
  type AiAssistantToolId,
} from './ai-assistant.policy';

@Injectable()
export class AiAssistantService {
  private readonly insights: AiSocietyInsights;

  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: AiOperationsService,
    private readonly workforce: WorkforceService,
    private readonly documents: DocumentsService,
  ) {
    this.insights = new AiSocietyInsights(prisma);
  }

  tools(roles:readonly AppRole[]){
    return {
      tools:AI_ASSISTANT_TOOLS.filter(tool=>this.canUseTool(roles,tool)).map(tool=>({
        id:tool.id,
        label:tool.label,
        context:tool.context,
        readOnly:true,
      })),
      mutationAllowList:['CREATE_HELPDESK_TICKET','BOOK_AMENITY','CREATE_VISITOR_PASS',...(hasPermission(roles,AppPermission.HELPDESK_REVIEW)?['ASSIGN_HELPDESK_TICKET' as const]:[])],
    };
  }

  async query(societyId:string,userId:string,roles:readonly AppRole[],message:string,unitId?:string) {
    const text=message.trim();
    if(text.length<2||text.length>1000) throw new BadRequestException('Assistant message must be between 2 and 1000 characters');
    const normalized=text.toLowerCase();
    const routed=residentIntentRoutingText(normalized);

    if(promptInjectionAttempt(normalized)){
      return this.auditedResponse(
        societyId,userId,unitId,'UNSUPPORTED','UNSUPPORTED',{},[],
        'Request instructions cannot override Aaraagate permissions, tenant scope, tool policy or confirmation requirements. No tool was invoked.',
        'BLOCKED',
      );
    }

    if(/bylaw|bye[- ]?law|policy|document|circular|handbook|society rule|community rule|meeting minutes|knowledge/.test(routed)){
      this.requireTool(roles,'SOCIETY_KNOWLEDGE');
      if(unitId) await this.assertResidentUnit(societyId,userId,unitId);
      const facts=await this.documents.searchKnowledgeForUser(
        societyId,userId,text,hasPermission(roles,AppPermission.DOCUMENTS_READ),
      );
      return this.auditedResponse(
        societyId,userId,unitId,'SOCIETY_KNOWLEDGE','SOCIETY_KNOWLEDGE',
        {matches:facts,answerBoundary:facts.length
          ? 'Use the cited excerpts as the authoritative published source. Open the document for full context before acting.'
          : 'No matching published society document was found. No policy answer was invented.'},
        ['SocietyDocument','SocietyDocumentKnowledge'],
        facts.length
          ? 'Grounded society knowledge from current published document versions with document citations.'
          : 'No matching published society knowledge was found; no answer was invented.',
        facts.length?'SUCCESS':'UNSUPPORTED',
      );
    }

    if(unitId && /notice|announcement|society update|community update/.test(routed)){
      this.requireTool(roles,'RESIDENT_NOTICES');
      await this.assertResidentUnit(societyId,userId,unitId);
      const facts=await this.insights.residentNotices(societyId,userId,unitId);
      return this.auditedResponse(societyId,userId,unitId,'RESIDENT_NOTICES','RESIDENT_NOTICES',facts,['Notice','NoticeRecipient'],'Grounded notices visible to the signed-in resident for the selected property and society.');
    }

    if(unitId && /visitor|gate|entry|pass|check[- ]?in|check[- ]?out/.test(routed)){
      this.requireTool(roles,'RESIDENT_GATE');
      await this.assertResidentUnit(societyId,userId,unitId);
      const facts=await this.insights.residentGateStatus(societyId,userId,unitId);
      return this.auditedResponse(societyId,userId,unitId,'RESIDENT_GATE','RESIDENT_GATE',facts,['Visitor','VisitorPass'],'Grounded visitor and gate-pass status for the signed-in resident and selected property only.');
    }

    if(unitId && /utility|meter|consumption|reading|electricity|water usage|water meter/.test(routed)){
      this.requireTool(roles,'RESIDENT_UTILITIES');
      await this.assertResidentUnit(societyId,userId,unitId);
      const facts=await this.insights.residentUtilities(societyId,unitId);
      return this.auditedResponse(
        societyId,userId,unitId,'RESIDENT_UTILITIES','RESIDENT_UTILITIES',facts,
        ['UtilityMeter','UtilityReading','UtilityChargeDraft','MaintenanceInvoice'],
        'Grounded utility usage, recent-delta attention and issued-charge evidence for the selected property. Elevated usage is only a comparison signal—not a leak, fault or billing diagnosis—and prepaid recharge is not claimed without authoritative provider evidence.',
      );
    }

    if(unitId && /resident request|noc|no[- ]?dues|address proof|certificate|permission letter|parking permission|move[- ]?out letter/.test(routed)){
      this.requireTool(roles,'RESIDENT_REQUESTS');
      await this.assertResidentUnit(societyId,userId,unitId);
      const facts=await this.insights.residentRequests(societyId,unitId);
      return this.auditedResponse(
        societyId,userId,unitId,'RESIDENT_REQUESTS','RESIDENT_REQUESTS',facts,
        ['HelpdeskTicket'],
        'Grounded status of resident certificate and permission requests for the selected property. Society issuance/legal validity is not inferred.',
      );
    }

    if(unitId && /staff|domestic help|worker|workforce|maid|driver|household staff/.test(routed)){
      this.requireTool(roles,'RESIDENT_WORKFORCE');
      const facts=await this.workforce.residentStatusMine(societyId,userId,unitId);
      return this.auditedResponse(societyId,userId,unitId,'RESIDENT_WORKFORCE','RESIDENT_WORKFORCE',facts,['WorkforceAssignment','DomesticWorker','WorkforceLeave','AccessRequest','WorkforcePaymentRecord'],'Grounded household-staff status, gate-derived attendance and resident-recorded payment evidence for the current occupant only. Scheduled evidence gaps are not labelled absence, and payment records are not bank/payroll proof.');
    }

    if(unitId && /due|maintenance|invoice|receipt|payment|booking|status|complaint|ticket/.test(routed)){
      this.requireTool(roles,'RESIDENT_STATUS');
      await this.assertResidentUnit(societyId,userId,unitId);
      const facts=await this.residentStatus(societyId,userId,unitId,roles);
      const sources=[
        ...(canReadPropertyPayables(roles)?['MaintenanceInvoice','Payment']:[]),
        ...(hasPermission(roles,AppPermission.HELPDESK_READ_OWN)?['HelpdeskTicket']:[]),
        ...(hasPermission(roles,AppPermission.AMENITY_READ)?['AmenityBooking']:[]),
        ...(hasPermission(roles,AppPermission.SERVICES_MARKETPLACE_USE)?['ServiceBooking']:[]),
      ];
      return this.auditedResponse(societyId,userId,unitId,'RESIDENT_STATUS','RESIDENT_STATUS',facts,sources,'Grounded status for the selected property only.');
    }

    if(/overdue|collection|ageing|aging|arrears|maintenance due/.test(routed)){
      this.requireTool(roles,'SOCIETY_FINANCE');
      const thresholdPaise=amountThresholdPaise(text);
      const facts=await this.insights.societyFinance(societyId,thresholdPaise);
      return this.auditedResponse(
        societyId,userId,unitId,'SOCIETY_FINANCE','SOCIETY_FINANCE',facts,['MaintenanceInvoice','Payment'],
        `Grounded finance summary from current society accounting data${thresholdPaise? ` for overdue amounts of at least ₹${(thresholdPaise/100).toLocaleString('en-IN')}`:''}.`,
      );
    }

    if(/sla|helpdesk|complaint|ticket/.test(routed)){
      this.requireTool(roles,'HELPDESK_OPERATIONS');
      const facts=await this.operations.operationsSummary(societyId);
      return this.auditedResponse(societyId,userId,unitId,'HELPDESK_OPERATIONS','HELPDESK_OPERATIONS',facts,['HelpdeskTicket'],'Grounded helpdesk summary from open society tickets and SLA state.');
    }

    if(/security|incident|session|revocation|replay/.test(routed)){
      this.requireTool(roles,'SECURITY_EVENTS');
      const facts=await this.insights.securitySummary(societyId);
      return this.auditedResponse(societyId,userId,unitId,'SECURITY_EVENTS','SECURITY_EVENTS',facts,['SecurityEvent'],'Grounded security summary from privacy-minimal society security events.');
    }

    if(/facility|facilities|asset|work order|amc|preventive maintenance/.test(routed)){
      this.requireTool(roles,'FACILITIES');
      const facts=await this.insights.facilitiesSummary(societyId);
      return this.auditedResponse(societyId,userId,unitId,'FACILITIES','FACILITIES',facts,['FacilityAsset','FacilityWorkOrder','FacilityMaintenancePlan'],'Grounded facilities summary including overdue work, repeated corrective-work signals and recorded warranty dates. These are operational attention signals, not physical-condition, root-cause or vendor-performance diagnoses.');
    }

    if(/governance|committee|meeting|resolution|minutes|action item|agm|sgm/.test(routed)){
      this.requireTool(roles,'GOVERNANCE');
      const facts=await this.insights.governanceSummary(societyId);
      return this.auditedResponse(societyId,userId,unitId,'GOVERNANCE','GOVERNANCE',facts,['GovernanceMeeting','GovernanceResolution','GovernanceActionItem'],'Grounded governance summary from current society meeting, resolution and action evidence. This does not determine statutory validity.');
    }

    if(/vendor|procurement|purchase request|supplier/.test(routed)){
      this.requireTool(roles,'VENDORS');
      const facts=await this.insights.vendorSummary(societyId);
      return this.auditedResponse(societyId,userId,unitId,'VENDORS','VENDORS',facts,['SocietyVendor','ProcurementRequest'],'Grounded vendor/procurement summary from current society records.');
    }

    if(/amenity|service|provider|plumber|electrician|cleaning/.test(routed)){
      this.requireTool(roles,'DISCOVERY');
      if(unitId) await this.assertResidentUnit(societyId,userId,unitId);
      const facts=await this.insights.discovery(societyId);
      return this.auditedResponse(societyId,userId,unitId,'DISCOVERY','DISCOVERY',facts,['Amenity','ServiceOffering','ServiceProviderSociety'],'Grounded discovery from active amenities and approved society service offerings.');
    }

    return this.auditedResponse(
      societyId,userId,unitId,'UNSUPPORTED','UNSUPPORTED',
      {supported:this.tools(roles).tools.map(tool=>tool.label)},
      [],
      'I could not map that request to an approved Aaraagate AI tool. No answer was invented and no mutation was attempted.',
      'UNSUPPORTED',
    );
  }

  async actionCentre(societyId:string,roles:readonly AppRole[]) {
    const cards:Array<{
      id:string;domain:string;severity:'LOW'|'MEDIUM'|'HIGH';title:string;summary:string;prompt:string;sources:string[];metrics:Record<string,number|string|null>;whyNow?:string;recommendedNextStep?:string;likelyCause?:string;safeWorkflow?:string[];
      evidenceQuality?:{sourceCount:number;basis:'CURRENT_QUERY_SNAPSHOT';causalClaim:false;interpretation:'DETERMINISTIC_SIGNAL_NOT_CAUSAL_PROOF'|'FACT_SUMMARY'};
      actionIntent?:{mode:'READ_ONLY_DRILLDOWN';workspaceHref:string;workspaceLabel:string;confirmationRequired:true;mutationAllowed:false};
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
        metrics:{overdueCount:finance.overdueCount,overduePaise:finance.overduePaise,over30Days:finance.overdueOver30Days,collectionChangePercent:finance.collectionChangePercent},
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
      HELPDESK:{href:'/',label:'Helpdesk operations'},
      GATE:{href:'/',label:'Gate operations'},
      SECURITY:{href:'/',label:'Security operations'},
      FACILITIES:{href:'/facilities',label:'Facilities workspace'},
      GOVERNANCE:{href:'/governance',label:'Governance workspace'},
      PROCUREMENT:{href:'/vendors',label:'Vendor & procurement workspace'},
    };
    const evidenceCards=cards.map(card=>({
      ...card,
      actionIntent:{
        mode:'READ_ONLY_DRILLDOWN' as const,
        workspaceHref:workspaceByDomain[card.domain]?.href??'/',
        workspaceLabel:workspaceByDomain[card.domain]?.label??'Operations workspace',
        confirmationRequired:true as const,
        mutationAllowed:false as const,
      },
      evidenceQuality:{
        sourceCount:card.sources.length,
        basis:'CURRENT_QUERY_SNAPSHOT' as const,
        causalClaim:false as const,
        interpretation:(card.likelyCause?'DETERMINISTIC_SIGNAL_NOT_CAUSAL_PROOF':'FACT_SUMMARY') as 'DETERMINISTIC_SIGNAL_NOT_CAUSAL_PROOF'|'FACT_SUMMARY',
      },
    }));
    const rank={HIGH:0,MEDIUM:1,LOW:2} as const;
    const safetyRank=(card:(typeof evidenceCards)[number])=>card.id==='gate-attention'&&Number(card.metrics.criticalIncidents??0)>0?0:1;
    evidenceCards.sort((a,b)=>rank[a.severity]-rank[b.severity]||safetyRank(a)-safetyRank(b)||a.domain.localeCompare(b.domain));
    const highPriorityCount=evidenceCards.filter(card=>card.severity==='HIGH').length;
    const mediumPriorityCount=evidenceCards.filter(card=>card.severity==='MEDIUM').length;
    const focus=evidenceCards[0]??null;
    return {
      cards:evidenceCards,
      brief:{
        highPriorityCount,
        mediumPriorityCount,
        attentionCount:highPriorityCount+mediumPriorityCount,
        recommendedFocus:focus?{domain:focus.domain,title:focus.title,prompt:focus.prompt,whyNow:focus.whyNow??focus.summary,recommendedNextStep:focus.recommendedNextStep??'Open the relevant operational workspace and review the grounded evidence.',likelyCause:focus.likelyCause??'No deterministic cause signal is available.',safeWorkflow:focus.safeWorkflow??['Review the grounded evidence in the relevant workspace'],actionIntent:focus.actionIntent,evidenceQuality:focus.evidenceQuality}:null,
        explanation:'Priority is deterministic from the current permission-scoped evidence snapshot. Likely-cause text is a signal interpretation, not causal proof, and no autonomous mutation is performed.',
      },
      generatedAt:new Date().toISOString(),grounded:true,mutationPerformed:false
    };
  }

  async proposeHelpdeskFromText(societyId:string,userId:string,unitId:string,sourceText:string){
    const text=sourceText.trim();
    if(text.length<5||text.length>2000) throw new BadRequestException('Complaint text must be between 5 and 2000 characters');
    await this.assertResidentUnit(societyId,userId,unitId);
    const first=text.split(/[.!?\n]/).map(part=>part.trim()).find(Boolean)??'Resident request';
    const title=first.slice(0,120);
    return this.operations.proposeHelpdesk(societyId,userId,{unitId,title,description:text,priority:'NORMAL'});
  }

  noticeDraft(topic:string,language:'en-IN'|'hi-IN'|'ta-IN',audience?:string){
    const clean=topic.trim();
    if(clean.length<3||clean.length>500) throw new BadRequestException('Notice topic must be between 3 and 500 characters');
    const suffix=audience?.trim()? ` Audience: ${audience.trim()}.`:'';
    const templates={
      'en-IN':{title:`Notice: ${clean.slice(0,100)}`,body:`Dear residents, ${clean}. Please follow the society guidance and contact the management team if you need clarification.${suffix}`},
      'hi-IN':{title:`सूचना: ${clean.slice(0,100)}`,body:`प्रिय निवासियों, ${clean}। कृपया सोसायटी के निर्देशों का पालन करें और किसी स्पष्टीकरण के लिए प्रबंधन टीम से संपर्क करें।${suffix}`},
      'ta-IN':{title:`அறிவிப்பு: ${clean.slice(0,100)}`,body:`அன்புள்ள குடியிருப்பாளர்களே, ${clean}. தயவுசெய்து சங்க வழிகாட்டுதலைப் பின்பற்றவும்; விளக்கம் தேவைப்பட்டால் நிர்வாகக் குழுவைத் தொடர்புகொள்ளவும்.${suffix}`},
    } as const;
    return {...templates[language],language,humanApprovalRequired:true,mutationPerformed:false};
  }

  async audit(societyId:string,page=1,pageSize=50){
    if(!Number.isSafeInteger(page)||page<1) throw new BadRequestException('page must be positive');
    if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100) throw new BadRequestException('pageSize must be between 1 and 100');
    const offset=(page-1)*pageSize;
    const [items,retrievals]=await Promise.all([
      this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        SELECT "id","actorUserId","action","status","confirmedAt","executedAt","createdAt","updatedAt"
        FROM "AiOperationProposal"
        WHERE "societyId"=${societyId}::uuid
        ORDER BY "createdAt" DESC,"id" DESC
        OFFSET ${offset} LIMIT ${pageSize}
      `),
      this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        SELECT "id","actorUserId","toolId","intent","unitId","sources","status","createdAt"
        FROM "AiAssistantRetrievalAudit"
        WHERE "societyId"=${societyId}::uuid
        ORDER BY "createdAt" DESC,"id" DESC
        OFFSET ${offset} LIMIT ${pageSize}
      `),
    ]);
    return {page,pageSize,items,retrievals};
  }

  private response(intent:AiAssistantIntent,facts:unknown,sources:string[],answer:string){
    return {intent,answer,facts,sources,grounded:true,mutationPerformed:false};
  }

  private async auditedResponse(
    societyId:string,
    userId:string,
    unitId:string|undefined,
    toolId:AiAssistantToolId|'UNSUPPORTED',
    intent:AiAssistantIntent,
    facts:unknown,
    sources:string[],
    answer:string,
    status:'SUCCESS'|'UNSUPPORTED'|'BLOCKED'='SUCCESS',
  ){
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "AiAssistantRetrievalAudit"
        ("societyId","actorUserId","toolId","intent","unitId","sources","status")
      VALUES (
        ${societyId}::uuid,
        ${userId}::uuid,
        ${toolId},
        ${intent},
        ${unitId??null}::uuid,
        ${JSON.stringify(sources)}::jsonb,
        ${status}
      )
    `);
    return this.response(intent,facts,sources,answer);
  }

  private tool(toolId:AiAssistantToolId){
    const tool=AI_ASSISTANT_TOOLS.find(candidate=>candidate.id===toolId);
    if(!tool) throw new BadRequestException('Assistant tool is not registered');
    return tool;
  }

  private canUseTool(roles:readonly AppRole[],tool:AiAssistantToolDefinition){
    return tool.permissionMode==='ALL'
      ? tool.permissions.every(permission=>hasPermission(roles,permission))
      : tool.permissions.some(permission=>hasPermission(roles,permission));
  }

  private requireTool(roles:readonly AppRole[],toolId:AiAssistantToolId){
    const tool=this.tool(toolId);
    if(!this.canUseTool(roles,tool)) throw new ForbiddenException(`Assistant tool ${toolId} is not permitted for this role`);
  }



  private async residentStatus(societyId:string,userId:string,unitId:string,roles:readonly AppRole[]){
    const invoices=canReadPropertyPayables(roles)
      ? await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
          SELECT "id","invoiceNumber","amountPaise","dueDate","status" FROM "MaintenanceInvoice"
          WHERE "societyId"=${societyId}::uuid AND "unitId"=${unitId}::uuid ORDER BY "issuedAt" DESC LIMIT 20
        `)
      : [];
    const payments=canReadPropertyPayables(roles)
      ? await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
          SELECT p."id",p."invoiceId",p."amountPaise",p."status",p."createdAt",p."completedAt"
          FROM "Payment" p JOIN "MaintenanceInvoice" i ON i."id"=p."invoiceId" AND i."societyId"=p."societyId"
          WHERE p."societyId"=${societyId}::uuid AND i."unitId"=${unitId}::uuid
            AND (p."payerUserId"=${userId}::uuid OR EXISTS(
              SELECT 1 FROM "UnitOwnership" ow WHERE ow."societyId"=${societyId}::uuid AND ow."unitId"=${unitId}::uuid
                AND ow."userId"=${userId}::uuid AND ow."active"=TRUE AND ow."verified"=TRUE
                AND ow."effectiveFrom"<=CURRENT_TIMESTAMP AND (ow."effectiveTo" IS NULL OR ow."effectiveTo">CURRENT_TIMESTAMP)
            ))
          ORDER BY p."createdAt" DESC LIMIT 20
        `)
      : [];
    const tickets=hasPermission(roles,AppPermission.HELPDESK_READ_OWN)
      ? await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
          SELECT "id","title","priority","status","createdAt","resolvedAt" FROM "HelpdeskTicket"
          WHERE "societyId"=${societyId}::uuid AND "unitId"=${unitId}::uuid AND "createdById"=${userId}::uuid
          ORDER BY "createdAt" DESC LIMIT 20
        `)
      : [];
    const amenities=hasPermission(roles,AppPermission.AMENITY_READ)
      ? await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
          SELECT "id","amenityId","startsAt","endsAt","status" FROM "AmenityBooking"
          WHERE "societyId"=${societyId}::uuid AND "unitId"=${unitId}::uuid AND "userId"=${userId}::uuid
          ORDER BY "createdAt" DESC LIMIT 20
        `)
      : [];
    const services=hasPermission(roles,AppPermission.SERVICES_MARKETPLACE_USE)
      ? await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
          SELECT "id","offeringId","scheduledFrom","scheduledUntil","status" FROM "ServiceBooking"
          WHERE "societyId"=${societyId}::uuid AND "unitId"=${unitId}::uuid AND "residentUserId"=${userId}::uuid
          ORDER BY "createdAt" DESC LIMIT 20
        `)
      : [];
    return {invoices,payments,tickets,amenityBookings:amenities,serviceBookings:services};
  }

  private async assertResidentUnit(societyId:string,userId:string,unitId:string){
    const rows=await this.prisma.$queryRaw<Array<{allowed:boolean}>>(Prisma.sql`
      SELECT TRUE AS "allowed" FROM "Unit" u
      WHERE u."id"=${unitId}::uuid AND u."societyId"=${societyId}::uuid
        AND ${currentResidentPropertySql(societyId,userId,unitId)}
      LIMIT 1
    `);
    if(!rows[0]?.allowed) throw new ForbiddenException('Unit is outside the current resident property context');
  }
}
