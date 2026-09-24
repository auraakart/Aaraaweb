import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppRole } from '../auth/auth.types';
import { AppPermission, hasPermission } from '../auth/permission.types';
import { PrismaService } from '../prisma/prisma.service';
import { AiOperationsService } from './ai-operations.service';

export type AiAssistantIntent =
  | 'SOCIETY_FINANCE'
  | 'RESIDENT_STATUS'
  | 'HELPDESK_OPERATIONS'
  | 'SECURITY_EVENTS'
  | 'FACILITIES'
  | 'VENDORS'
  | 'DISCOVERY'
  | 'RESIDENT_NOTICES'
  | 'RESIDENT_GATE'
  | 'GOVERNANCE'
  | 'UNSUPPORTED';

export type AiAssistantToolId = Exclude<AiAssistantIntent,'UNSUPPORTED'>;

type AiAssistantToolDefinition = {
  id: AiAssistantToolId;
  label: string;
  context: 'SOCIETY'|'PROPERTY';
  permissions: readonly AppPermission[];
  permissionMode: 'ANY'|'ALL';
};

const AI_ASSISTANT_TOOLS: readonly AiAssistantToolDefinition[] = [
  {id:'SOCIETY_FINANCE',label:'Society finance',context:'SOCIETY',permissions:[AppPermission.FINANCE_READ],permissionMode:'ALL'},
  {id:'RESIDENT_STATUS',label:'Resident property status',context:'PROPERTY',permissions:[AppPermission.HELPDESK_READ_OWN,AppPermission.PROPERTY_FINANCE_READ,AppPermission.AMENITY_READ,AppPermission.SERVICES_MARKETPLACE_USE],permissionMode:'ANY'},
  {id:'HELPDESK_OPERATIONS',label:'Helpdesk operations',context:'SOCIETY',permissions:[AppPermission.HELPDESK_REVIEW],permissionMode:'ALL'},
  {id:'SECURITY_EVENTS',label:'Security events',context:'SOCIETY',permissions:[AppPermission.AUDIT_READ],permissionMode:'ALL'},
  {id:'FACILITIES',label:'Facilities',context:'SOCIETY',permissions:[AppPermission.FACILITIES_READ],permissionMode:'ALL'},
  {id:'VENDORS',label:'Vendors and procurement',context:'SOCIETY',permissions:[AppPermission.SOCIETY_VENDORS_READ],permissionMode:'ALL'},
  {id:'DISCOVERY',label:'Amenities and services',context:'SOCIETY',permissions:[AppPermission.AMENITY_READ,AppPermission.SERVICES_MARKETPLACE_USE],permissionMode:'ANY'},
  {id:'RESIDENT_NOTICES',label:'Resident notices',context:'PROPERTY',permissions:[AppPermission.NOTICE_READ],permissionMode:'ALL'},
  {id:'RESIDENT_GATE',label:'Resident gate status',context:'PROPERTY',permissions:[AppPermission.VISITOR_READ_OWN,AppPermission.ACCESS_READ_OWN],permissionMode:'ANY'},
  {id:'GOVERNANCE',label:'Governance',context:'SOCIETY',permissions:[AppPermission.GOVERNANCE_READ],permissionMode:'ALL'},
] as const;

export function residentIntentRoutingText(text:string){
  const hints:string[]=[];
  const groups:Array<[RegExp,string]>=[
    [/शिकायत|புகார்|ఫిర్యాదు|ದೂರು|പരാതി|तक्रार|অভিযোগ/u,' complaint helpdesk ticket '],
    [/भुगतान|बकाया|கட்டணம்|நிலுவை|చెల్లింపు|బకాయి|ಪಾವತಿ|ಬಾಕಿ|പണമടവ്|കുടിശ്ശിക|भरणा|थकबाकी|পেমেন্ট|বকেয়া/u,' payment due maintenance invoice '],
    [/आगंतुक|मेहमान|கேட்|விருந்தினர்|గేట్|సందర్శకుడు|ಗೇಟ್|ಭೇಟಿಕಾರ|ഗേറ്റ്|സന്ദർശകൻ|पाहुणा|গেট|অতিথি/u,' visitor gate entry pass '],
    [/सूचना|அறிவிப்பு|ప్రకటన|ಪ್ರಕಟಣೆ|അറിയിപ്പ്|নোটিশ/u,' notice announcement community update '],
    [/सुविधा|सेवा|வசதி|சேவை|సౌకర్యం|సేవ|ಸೌಲಭ್ಯ|ಸೇವೆ|സൗകര്യം|സേവനം|সুবিধা|সেবা/u,' amenity service provider booking '],
  ];
  for(const [pattern,hint] of groups)if(pattern.test(text))hints.push(hint);
  return `${text} ${hints.join(' ')}`.trim();
}

@Injectable()
export class AiAssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: AiOperationsService,
  ) {}

  tools(roles:readonly AppRole[]){
    return {
      tools:AI_ASSISTANT_TOOLS.filter(tool=>this.canUseTool(roles,tool)).map(tool=>({
        id:tool.id,
        label:tool.label,
        context:tool.context,
        readOnly:true,
      })),
      mutationAllowList:['CREATE_HELPDESK_TICKET','BOOK_AMENITY','CREATE_VISITOR_PASS'] as const,
    };
  }

  async query(societyId:string,userId:string,roles:readonly AppRole[],message:string,unitId?:string) {
    const text=message.trim();
    if(text.length<2||text.length>1000) throw new BadRequestException('Assistant message must be between 2 and 1000 characters');
    const normalized=text.toLowerCase();
    const routed=residentIntentRoutingText(normalized);

    if(this.promptInjectionAttempt(normalized)){
      return this.auditedResponse(
        societyId,userId,unitId,'UNSUPPORTED','UNSUPPORTED',{},[],
        'Request instructions cannot override Aaraagate permissions, tenant scope, tool policy or confirmation requirements. No tool was invoked.',
        'BLOCKED',
      );
    }

    if(unitId && /notice|announcement|society update|community update/.test(routed)){
      this.requireTool(roles,'RESIDENT_NOTICES');
      await this.assertResidentUnit(societyId,userId,unitId);
      const facts=await this.residentNotices(societyId,userId,unitId);
      return this.auditedResponse(societyId,userId,unitId,'RESIDENT_NOTICES','RESIDENT_NOTICES',facts,['Notice','NoticeRecipient'],'Grounded notices visible to the signed-in resident for the selected property and society.');
    }

    if(unitId && /visitor|gate|entry|pass|check[- ]?in|check[- ]?out/.test(routed)){
      this.requireTool(roles,'RESIDENT_GATE');
      await this.assertResidentUnit(societyId,userId,unitId);
      const facts=await this.residentGateStatus(societyId,userId,unitId);
      return this.auditedResponse(societyId,userId,unitId,'RESIDENT_GATE','RESIDENT_GATE',facts,['Visitor','VisitorPass'],'Grounded visitor and gate-pass status for the signed-in resident and selected property only.');
    }

    if(unitId && /due|maintenance|invoice|receipt|payment|booking|status|complaint|ticket/.test(routed)){
      this.requireTool(roles,'RESIDENT_STATUS');
      await this.assertResidentUnit(societyId,userId,unitId);
      const facts=await this.residentStatus(societyId,userId,unitId,roles);
      const sources=[
        ...(hasPermission(roles,AppPermission.PROPERTY_FINANCE_READ)?['MaintenanceInvoice','Payment']:[]),
        ...(hasPermission(roles,AppPermission.HELPDESK_READ_OWN)?['HelpdeskTicket']:[]),
        ...(hasPermission(roles,AppPermission.AMENITY_READ)?['AmenityBooking']:[]),
        ...(hasPermission(roles,AppPermission.SERVICES_MARKETPLACE_USE)?['ServiceBooking']:[]),
      ];
      return this.auditedResponse(societyId,userId,unitId,'RESIDENT_STATUS','RESIDENT_STATUS',facts,sources,'Grounded status for the selected property only.');
    }

    if(/overdue|collection|ageing|aging|arrears|maintenance due/.test(routed)){
      this.requireTool(roles,'SOCIETY_FINANCE');
      const thresholdPaise=this.amountThresholdPaise(text);
      const facts=await this.societyFinance(societyId,thresholdPaise);
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
      const facts=await this.securitySummary(societyId);
      return this.auditedResponse(societyId,userId,unitId,'SECURITY_EVENTS','SECURITY_EVENTS',facts,['SecurityEvent'],'Grounded security summary from privacy-minimal society security events.');
    }

    if(/facility|facilities|asset|work order|amc|preventive maintenance/.test(routed)){
      this.requireTool(roles,'FACILITIES');
      const facts=await this.facilitiesSummary(societyId);
      return this.auditedResponse(societyId,userId,unitId,'FACILITIES','FACILITIES',facts,['FacilityAsset','FacilityWorkOrder','FacilityMaintenancePlan'],'Grounded facility summary from current society operations data.');
    }

    if(/governance|committee|meeting|resolution|minutes|action item|agm|sgm/.test(routed)){
      this.requireTool(roles,'GOVERNANCE');
      const facts=await this.governanceSummary(societyId);
      return this.auditedResponse(societyId,userId,unitId,'GOVERNANCE','GOVERNANCE',facts,['GovernanceMeeting','GovernanceResolution','GovernanceActionItem'],'Grounded governance summary from current society meeting, resolution and action evidence. This does not determine statutory validity.');
    }

    if(/vendor|procurement|purchase request|supplier/.test(routed)){
      this.requireTool(roles,'VENDORS');
      const facts=await this.vendorSummary(societyId);
      return this.auditedResponse(societyId,userId,unitId,'VENDORS','VENDORS',facts,['SocietyVendor','ProcurementRequest'],'Grounded vendor/procurement summary from current society records.');
    }

    if(/amenity|service|provider|plumber|electrician|cleaning/.test(routed)){
      this.requireTool(roles,'DISCOVERY');
      if(unitId) await this.assertResidentUnit(societyId,userId,unitId);
      const facts=await this.discovery(societyId);
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
      const finance=await this.societyFinance(societyId,0);
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
      const gate=await this.gateAttentionSummary(societyId);
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
      const security=await this.securitySummary(societyId);
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
      const facilities=await this.facilitiesSummary(societyId);
      cards.push({
        id:'facilities-risk',domain:'FACILITIES',
        severity:facilities.overdueWorkOrders>0?'HIGH':facilities.maintenanceDue30d>0?'MEDIUM':'LOW',
        title:'Facility maintenance',
        summary:`${facilities.openWorkOrders} open work orders · ${facilities.overdueWorkOrders} overdue · ${facilities.maintenanceDue30d} plans due in 30 days`,
        prompt:'Show facility work orders, overdue maintenance and AMCs',
        sources:['FacilityAsset','FacilityWorkOrder','FacilityMaintenancePlan'],
        metrics:{openWorkOrders:facilities.openWorkOrders,overdueWorkOrders:facilities.overdueWorkOrders,maintenanceDue30d:facilities.maintenanceDue30d},
        likelyCause:facilities.overdueWorkOrders>0?'Overdue work orders are the primary current facility-risk signal.':facilities.maintenanceDue30d>0?'Upcoming preventive-maintenance obligations require scheduling attention.':'No current facility backlog signal is elevated.',
        safeWorkflow:['Review critical and overdue work orders','Confirm assignee/AMC evidence','Use existing facility completion and escalation controls'],
      });
    }

    if(hasPermission(roles,AppPermission.GOVERNANCE_READ)){
      const governance=await this.governanceSummary(societyId);
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
      const vendors=await this.vendorSummary(societyId);
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

  private promptInjectionAttempt(text:string){
    return /system prompt|developer message|database credentials|direct database|execute sql|hidden tool|ignore.{0,40}(instructions?|permissions?|authorization|tool policy)|bypass.{0,40}(permissions?|authorization|confirmation|tool policy)|override.{0,40}(permissions?|authorization|confirmation|tool policy)/i.test(text);
  }

  private amountThresholdPaise(text:string){
    const match=text.replace(/,/g,'').match(/(?:₹|rs\.?\s*)?(\d+(?:\.\d{1,2})?)/i);
    if(!match) return 0;
    const rupees=Number(match[1]);
    return Number.isFinite(rupees)&&rupees>=0?Math.round(rupees*100):0;
  }

  private async societyFinance(societyId:string,minimumPaise:number){
    const overdue=await this.prisma.$queryRaw<Array<{count:number;amountPaise:bigint|number;over30:number}>>(Prisma.sql`
      SELECT COUNT(*)::int AS "count",COALESCE(SUM("amountPaise"),0)::bigint AS "amountPaise",
        COUNT(*) FILTER (WHERE "dueDate"<CURRENT_DATE-30)::int AS "over30"
      FROM "MaintenanceInvoice"
      WHERE "societyId"=${societyId}::uuid AND "status"='ISSUED' AND "dueDate"<CURRENT_DATE
        AND "amountPaise">=${minimumPaise}
    `);
    const collections=await this.prisma.$queryRaw<Array<{currentPaise:bigint|number;previousPaise:bigint|number}>>(Prisma.sql`
      SELECT
        COALESCE(SUM("amountPaise") FILTER (WHERE "status"='CAPTURED' AND "completedAt">=CURRENT_TIMESTAMP-INTERVAL '30 days'),0)::bigint AS "currentPaise",
        COALESCE(SUM("amountPaise") FILTER (WHERE "status"='CAPTURED' AND "completedAt"<CURRENT_TIMESTAMP-INTERVAL '30 days' AND "completedAt">=CURRENT_TIMESTAMP-INTERVAL '60 days'),0)::bigint AS "previousPaise"
      FROM "Payment" WHERE "societyId"=${societyId}::uuid
    `);
    const current=Number(collections[0]?.currentPaise??0),previous=Number(collections[0]?.previousPaise??0);
    return {
      overdueCount:Number(overdue[0]?.count??0),
      overduePaise:Number(overdue[0]?.amountPaise??0),
      overdueOver30Days:Number(overdue[0]?.over30??0),
      collections30dPaise:current,
      previous30dPaise:previous,
      collectionChangePercent:previous>0?Math.round(((current-previous)/previous)*10000)/100:null,
      minimumOverduePaise:minimumPaise,
    };
  }

  private async gateAttentionSummary(societyId:string){
    const rows=await this.prisma.$queryRaw<Array<{
      overstayCount:number;openIncidents:number;criticalIncidents:number;stalePatrolCount:number;
      criticalIncidentId:string|null;criticalIncidentTitle:string|null;
      oldestOverstayId:string|null;oldestOverstayName:string|null;oldestOverstayMinutes:number|null;
      staleCheckpointId:string|null;staleCheckpointName:string|null;
    }>>(Prisma.sql`
      WITH overstays AS (
        SELECT r."id",r."subjectName",r."enteredAt" FROM "AccessRequest" r
        WHERE r."societyId"=${societyId}::uuid AND r."status"='CHECKED_IN'
          AND r."enteredAt" IS NOT NULL AND r."exitedAt" IS NULL
          AND r."enteredAt"<CURRENT_TIMESTAMP-INTERVAL '4 hours'
      ),
      open_incidents AS (
        SELECT i."id",i."title",i."severity",i."occurredAt" FROM "SecurityIncident" i
        WHERE i."societyId"=${societyId}::uuid AND i."status"='OPEN'
      ),
      stale_checkpoints AS (
        SELECT c."id",c."name",MAX(s."scannedAt") AS "lastScannedAt"
        FROM "PatrolCheckpoint" c
        LEFT JOIN "PatrolScan" s ON s."societyId"=c."societyId" AND s."checkpointId"=c."id"
        WHERE c."societyId"=${societyId}::uuid AND c."active"=TRUE
        GROUP BY c."id",c."name"
        HAVING MAX(s."scannedAt") IS NULL OR MAX(s."scannedAt")<CURRENT_TIMESTAMP-INTERVAL '8 hours'
      )
      SELECT
        (SELECT COUNT(*)::int FROM overstays) AS "overstayCount",
        (SELECT COUNT(*)::int FROM open_incidents) AS "openIncidents",
        (SELECT COUNT(*)::int FROM open_incidents WHERE "severity"='CRITICAL') AS "criticalIncidents",
        (SELECT COUNT(*)::int FROM stale_checkpoints) AS "stalePatrolCount",
        (SELECT "id" FROM open_incidents WHERE "severity"='CRITICAL' ORDER BY "occurredAt" ASC,"id" ASC LIMIT 1) AS "criticalIncidentId",
        (SELECT "title" FROM open_incidents WHERE "severity"='CRITICAL' ORDER BY "occurredAt" ASC,"id" ASC LIMIT 1) AS "criticalIncidentTitle",
        (SELECT "id" FROM overstays ORDER BY "enteredAt" ASC,"id" ASC LIMIT 1) AS "oldestOverstayId",
        (SELECT "subjectName" FROM overstays ORDER BY "enteredAt" ASC,"id" ASC LIMIT 1) AS "oldestOverstayName",
        (SELECT FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP-"enteredAt"))/60)::int FROM overstays ORDER BY "enteredAt" ASC,"id" ASC LIMIT 1) AS "oldestOverstayMinutes",
        (SELECT "id" FROM stale_checkpoints ORDER BY "lastScannedAt" ASC NULLS FIRST,"id" ASC LIMIT 1) AS "staleCheckpointId",
        (SELECT "name" FROM stale_checkpoints ORDER BY "lastScannedAt" ASC NULLS FIRST,"id" ASC LIMIT 1) AS "staleCheckpointName"
    `);
    const row=rows[0];
    return {
      overstayCount:Number(row?.overstayCount??0),openIncidents:Number(row?.openIncidents??0),
      criticalIncidents:Number(row?.criticalIncidents??0),stalePatrolCount:Number(row?.stalePatrolCount??0),
      criticalIncidentId:row?.criticalIncidentId??null,criticalIncidentTitle:row?.criticalIncidentTitle??null,
      oldestOverstayId:row?.oldestOverstayId??null,oldestOverstayName:row?.oldestOverstayName??null,
      oldestOverstayMinutes:row?.oldestOverstayMinutes===null||row?.oldestOverstayMinutes===undefined?null:Number(row.oldestOverstayMinutes),
      staleCheckpointId:row?.staleCheckpointId??null,staleCheckpointName:row?.staleCheckpointName??null,
    };
  }

  private async securitySummary(societyId:string){
    const counts=await this.prisma.$queryRaw<Array<{eventType:string;count:number}>>(Prisma.sql`
      SELECT "eventType",COUNT(*)::int AS "count" FROM "SecurityEvent"
      WHERE "societyId"=${societyId}::uuid AND "occurredAt">=CURRENT_TIMESTAMP-INTERVAL '30 days'
      GROUP BY "eventType" ORDER BY COUNT(*) DESC,"eventType" ASC
    `);
    const recent=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      SELECT "id","eventType","reason","occurredAt" FROM "SecurityEvent"
      WHERE "societyId"=${societyId}::uuid
      ORDER BY "occurredAt" DESC,"id" DESC LIMIT 20
    `);
    return {windowDays:30,byType:counts,recent};
  }

  private async facilitiesSummary(societyId:string){
    const rows=await this.prisma.$queryRaw<Array<{activeAssets:number;openWorkOrders:number;overdueWorkOrders:number;maintenanceDue30d:number}>>(Prisma.sql`
      SELECT
        (SELECT COUNT(*)::int FROM "FacilityAsset" WHERE "societyId"=${societyId}::uuid AND "status"='ACTIVE') AS "activeAssets",
        (SELECT COUNT(*)::int FROM "FacilityWorkOrder" WHERE "societyId"=${societyId}::uuid AND "status" NOT IN ('COMPLETED','CANCELLED')) AS "openWorkOrders",
        (SELECT COUNT(*)::int FROM "FacilityWorkOrder" WHERE "societyId"=${societyId}::uuid AND "status" NOT IN ('COMPLETED','CANCELLED') AND "dueAt"<CURRENT_TIMESTAMP) AS "overdueWorkOrders",
        (SELECT COUNT(*)::int FROM "FacilityMaintenancePlan" WHERE "societyId"=${societyId}::uuid AND "active"=TRUE AND "nextDueAt"<=CURRENT_TIMESTAMP+INTERVAL '30 days') AS "maintenanceDue30d"
    `);
    return rows[0]??{activeAssets:0,openWorkOrders:0,overdueWorkOrders:0,maintenanceDue30d:0};
  }

  private async vendorSummary(societyId:string){
    const rows=await this.prisma.$queryRaw<Array<{activeVendors:number;submittedRequests:number;approvedRequests:number}>>(Prisma.sql`
      SELECT
        (SELECT COUNT(*)::int FROM "SocietyVendor" WHERE "societyId"=${societyId}::uuid AND "status"='ACTIVE') AS "activeVendors",
        (SELECT COUNT(*)::int FROM "ProcurementRequest" WHERE "societyId"=${societyId}::uuid AND "status"='SUBMITTED') AS "submittedRequests",
        (SELECT COUNT(*)::int FROM "ProcurementRequest" WHERE "societyId"=${societyId}::uuid AND "status"='APPROVED') AS "approvedRequests"
    `);
    return rows[0]??{activeVendors:0,submittedRequests:0,approvedRequests:0};
  }

  private async residentNotices(societyId:string,userId:string,unitId:string){
    return this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      SELECT n."id",n."title",n."category",n."importance",n."requiresAcknowledgement",
             n."publishedAt",n."expiresAt",nr."readAt",nr."acknowledgedAt"
      FROM "Notice" n
      LEFT JOIN "NoticeRecipient" nr
        ON nr."noticeId"=n."id" AND nr."societyId"=n."societyId" AND nr."userId"=${userId}::uuid
      WHERE n."societyId"=${societyId}::uuid
        AND n."status"='PUBLISHED'
        AND n."publishedAt"<=CURRENT_TIMESTAMP
        AND (n."expiresAt" IS NULL OR n."expiresAt">CURRENT_TIMESTAMP)
        AND (
          n."targetUnitId"=${unitId}::uuid
          OR (n."targetUnitId" IS NULL AND n."targetBuildingId" IS NULL)
          OR nr."userId" IS NOT NULL
        )
        AND (
          EXISTS(
            SELECT 1 FROM "UnitOwnership" ow
            WHERE ow."societyId"=${societyId}::uuid AND ow."unitId"=${unitId}::uuid AND ow."userId"=${userId}::uuid
              AND ow."active"=TRUE AND ow."verified"=TRUE AND ow."effectiveFrom"<=CURRENT_TIMESTAMP
              AND (ow."effectiveTo" IS NULL OR ow."effectiveTo">CURRENT_TIMESTAMP)
          )
          OR (
            n."audience"='OWNER_AND_OCCUPANTS' AND EXISTS(
              SELECT 1 FROM "UnitOccupancy" oc
              WHERE oc."societyId"=${societyId}::uuid AND oc."unitId"=${unitId}::uuid AND oc."userId"=${userId}::uuid
                AND oc."active"=TRUE AND oc."effectiveFrom"<=CURRENT_TIMESTAMP
                AND (oc."effectiveTo" IS NULL OR oc."effectiveTo">CURRENT_TIMESTAMP)
            )
          )
        )
      ORDER BY CASE n."importance" WHEN 'CRITICAL' THEN 0 WHEN 'IMPORTANT' THEN 1 ELSE 2 END,n."publishedAt" DESC
      LIMIT 20
    `);
  }

  private async residentGateStatus(societyId:string,userId:string,unitId:string){
    return this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      SELECT v."id",v."name",v."purpose",v."status",v."createdAt",
             vp."id" AS "passId",vp."status" AS "passStatus",vp."validFrom",vp."validUntil",vp."checkedInAt",vp."checkedOutAt"
      FROM "Visitor" v
      LEFT JOIN "VisitorPass" vp ON vp."visitorId"=v."id" AND vp."societyId"=v."societyId"
      WHERE v."societyId"=${societyId}::uuid AND v."unitId"=${unitId}::uuid AND v."hostUserId"=${userId}::uuid
      ORDER BY v."createdAt" DESC,vp."createdAt" DESC
      LIMIT 20
    `);
  }

  private async governanceSummary(societyId:string){
    const [meetings,resolutions,actions]=await Promise.all([
      this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        SELECT "id","meetingType","status","title","scheduledAt","heldAt","location","quorumRequired","quorumPresent"
        FROM "GovernanceMeeting" WHERE "societyId"=${societyId}::uuid ORDER BY "scheduledAt" DESC LIMIT 20
      `),
      this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        SELECT "id","meetingId","title","status","approvalRequired","approvalRecorded","recordedAt"
        FROM "GovernanceResolution" WHERE "societyId"=${societyId}::uuid ORDER BY "recordedAt" DESC LIMIT 20
      `),
      this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        SELECT "id","meetingId","title","status","ownerUserId","dueAt","completedAt"
        FROM "GovernanceActionItem" WHERE "societyId"=${societyId}::uuid
        ORDER BY COALESCE("dueAt","createdAt") DESC LIMIT 20
      `),
    ]);
    return {meetings,resolutions,actions};
  }

  private async discovery(societyId:string){
    const amenities=await this.prisma.$queryRaw<Array<{id:string;name:string;location:string|null;requiresApproval:boolean}>>(Prisma.sql`
      SELECT "id","name","location","requiresApproval" FROM "Amenity"
      WHERE "societyId"=${societyId}::uuid AND "active"=TRUE ORDER BY "name" ASC LIMIT 20
    `);
    const services=await this.prisma.$queryRaw<Array<{id:string;name:string;pricePaise:number;providerName:string;categoryName:string}>>(Prisma.sql`
      SELECT so."id",so."name",so."pricePaise",sp."businessName" AS "providerName",sc."name" AS "categoryName"
      FROM "ServiceOffering" so
      JOIN "ServiceProvider" sp ON sp."id"=so."providerId" AND sp."active"=TRUE AND sp."verification"='VERIFIED'
      JOIN "ServiceCategory" sc ON sc."id"=so."categoryId" AND sc."active"=TRUE
      JOIN "ServiceProviderSociety" sps ON sps."providerId"=sp."id" AND sps."societyId"=${societyId}::uuid AND sps."status"='APPROVED'
      WHERE so."active"=TRUE ORDER BY so."name" ASC LIMIT 20
    `);
    return {amenities,services};
  }

  private async residentStatus(societyId:string,userId:string,unitId:string,roles:readonly AppRole[]){
    const invoices=hasPermission(roles,AppPermission.PROPERTY_FINANCE_READ)
      ? await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
          SELECT "id","invoiceNumber","amountPaise","dueDate","status" FROM "MaintenanceInvoice"
          WHERE "societyId"=${societyId}::uuid AND "unitId"=${unitId}::uuid ORDER BY "issuedAt" DESC LIMIT 20
        `)
      : [];
    const payments=hasPermission(roles,AppPermission.PROPERTY_FINANCE_READ)
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
      WHERE u."id"=${unitId}::uuid AND u."societyId"=${societyId}::uuid AND (
        EXISTS(SELECT 1 FROM "UnitOccupancy" o WHERE o."societyId"=${societyId}::uuid AND o."unitId"=u."id" AND o."userId"=${userId}::uuid AND o."active"=TRUE AND o."effectiveFrom"<=CURRENT_TIMESTAMP AND (o."effectiveTo" IS NULL OR o."effectiveTo">CURRENT_TIMESTAMP))
        OR EXISTS(SELECT 1 FROM "UnitOwnership" ow WHERE ow."societyId"=${societyId}::uuid AND ow."unitId"=u."id" AND ow."userId"=${userId}::uuid AND ow."active"=TRUE AND ow."verified"=TRUE AND ow."effectiveFrom"<=CURRENT_TIMESTAMP AND (ow."effectiveTo" IS NULL OR ow."effectiveTo">CURRENT_TIMESTAMP))
      ) LIMIT 1
    `);
    if(!rows[0]?.allowed) throw new ForbiddenException('Unit is outside the current resident property context');
  }
}
