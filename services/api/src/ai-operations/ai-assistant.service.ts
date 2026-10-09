import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppRole } from '../auth/auth.types';
import { AppPermission, hasPermission } from '../auth/permission.types';
import { canReadPropertyPayables } from '../auth/property-finance-access';
import { currentOccupantPropertySql, currentPayerPropertySql, currentResidentPropertySql } from '../auth/property-scope.sql';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceService } from '../workforce/workforce.service';
import { DocumentsService } from '../documents/documents.service';
import { AiOperationsService } from './ai-operations.service';
import { AiSocietyInsights } from './ai-society-insights';
import { residentAnswer } from './ai-resident-answer';
import { AiCopilot, type RecommendationOutcomeStatus } from './ai-copilot';
import { AiActionCentre } from './ai-action-centre';

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
  private readonly copilot: AiCopilot;
  private readonly actionCentreBuilder: AiActionCentre;

  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: AiOperationsService,
    private readonly workforce: WorkforceService,
    private readonly documents: DocumentsService,
  ) {
    this.insights = new AiSocietyInsights(prisma);
    this.copilot = new AiCopilot(prisma);
    this.actionCentreBuilder = new AiActionCentre(operations,this.insights,this.copilot);
  }

  tools(roles:readonly AppRole[]){
    return {
      tools:AI_ASSISTANT_TOOLS.filter(tool=>this.canUseTool(roles,tool)).map(tool=>({
        id:tool.id,
        label:tool.label,
        context:tool.context,
        readOnly:true,
      })),
      mutationAllowList:[
        'CREATE_HELPDESK_TICKET','BOOK_AMENITY','CREATE_VISITOR_PASS',
        ...(hasPermission(roles,AppPermission.HELPDESK_REVIEW)?['ASSIGN_HELPDESK_TICKET' as const]:[]),
        ...(hasPermission(roles,AppPermission.HELPDESK_REVIEW)&&hasPermission(roles,AppPermission.FACILITIES_MANAGE)?['CREATE_FACILITY_WORK_ORDER_FROM_HELPDESK' as const]:[]),
      ],
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

    // V4.89.2: answer own household questions from the active, selected home
    // after runtime occupant authorization. Never return phone/email, past
    // occupancies, or another household's members.
    if(/\b(?:family|household)\s+members?\b|\bmembers?\s+(?:of\s+)?(?:(?:my|our)\s+)?(?:family|household)\b/.test(routed)){
      this.requireTool(roles,'RESIDENT_HOUSEHOLD');
      if(!unitId){
        return this.auditedResponse(
          societyId,userId,unitId,'UNSUPPORTED','UNSUPPORTED',{},[],
          'Select your current home before asking for its family member list.',
          'UNSUPPORTED',
        );
      }
      await this.assertCurrentOccupantUnit(societyId,userId,unitId);
      const rows=await this.prisma.$queryRaw<Array<{name:string|null,relation:string}>>(Prisma.sql`
        SELECT u."name", o."relation"
        FROM "UnitOccupancy" o
        JOIN "User" u ON u."id"=o."userId"
        WHERE o."societyId"=${societyId}::uuid AND o."unitId"=${unitId}::uuid
          AND o."relation"='FAMILY_MEMBER' AND o."active"=TRUE
          AND o."effectiveFrom"<=CURRENT_TIMESTAMP
          AND (o."effectiveTo" IS NULL OR o."effectiveTo">CURRENT_TIMESTAMP)
          AND u."status"='ACTIVE'
        ORDER BY u."name",o."createdAt" LIMIT 30
      `);
      const members=rows.map(row=>({
        name:(row.name??'').replace(/\s+/g,' ').trim().slice(0,80)||'Unnamed member',
        relation:row.relation,
      }));
      const answer=members.length
        ? `Your current household has ${members.length} approved family member(s): ${members.map(member=>member.name).join(', ')}. For details and permitted management actions, open Profile → Family members.`
        : 'There are no active approved family members recorded for your selected home. Open Profile → Family members to review pending requests.';
      return this.auditedResponse(
        societyId,userId,unitId,'RESIDENT_HOUSEHOLD','RESIDENT_HOUSEHOLD',
        {members,limitedTo:30},['UnitOccupancy','User'],answer,
      );
    }

    const plan=this.copilot.plan(routed,this.tools(roles).tools.map(tool=>tool.id));
    if(!unitId&&plan.multiDomain){
      const snapshot=await this.multiDomainSnapshot(societyId,plan.selected,text);
      const sources=[...new Set(Object.values(snapshot.sources).flat())];
      const facts={
        planner:{selectedTools:plan.selected,omittedUnauthorizedTools:plan.omitted},
        domains:snapshot.domains,
        hypotheses:this.copilot.hypotheses(snapshot.domains),
        boundary:'The copilot correlates permission-authorized Aaraagate evidence only. Coinciding signals are hypotheses for verification, not causal proof.',
      };
      return this.auditedResponse(
        societyId,userId,unitId,'MULTI_DOMAIN','MULTI_DOMAIN',facts,sources,
        `Grounded multi-domain review across ${plan.selected.length} authorized operational domains. No causal relationship is asserted without direct evidence.`,
      );
    }

    if(/bylaw|bye[- ]?law|policy|document|circular|handbook|society rule|community rule|meeting minutes|knowledge|(?:garbage|waste|trash|recycling)\s*(?:collection|schedule|rules?)?|pet rules?|parking rules?|pool (?:rules?|hours?|timings?)|clubhouse rules?|quiet hours?|visitor hours?|society office hours?|society contact|emergency procedure/.test(routed)){
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
          ? `The published society document "${String(facts[0].title).trim().slice(0,100)}" (version ${facts[0].version}) includes: ${String(facts[0].excerpt).trim().slice(0,420)}. Open the cited document for full context and the latest applicable instructions.`
          : 'No matching published society knowledge was found; no answer was invented.',
        facts.length?'SUCCESS':'UNSUPPORTED',
      );
    }

    if(unitId && /notice|announcement|society update|community update|water (?:shutdown|outage)|power outage|electricity outage|lift maintenance|planned (?:water|power|lift) shutdown/.test(routed)){
      this.requireTool(roles,'RESIDENT_NOTICES');
      await this.assertResidentUnit(societyId,userId,unitId);
      const facts=await this.insights.residentNotices(societyId,userId,unitId);
      const titles=facts.slice(0,5).map(item=>String(item.title??'').replace(/\s+/g,' ').trim().slice(0,120)).filter(Boolean);
      const answer=titles.length
        ? `Your current published society notices include: ${titles.join('; ')}. Open Notices to see timing, audience and full details.`
        : 'No currently published notices are visible for your selected property.';
      return this.auditedResponse(societyId,userId,unitId,'RESIDENT_NOTICES','RESIDENT_NOTICES',facts,['Notice','NoticeRecipient'],answer);
    }

    if(unitId && /visitor|gate|entry|pass|check[- ]?in|check[- ]?out/.test(routed)){
      this.requireTool(roles,'RESIDENT_GATE');
      await this.assertCurrentOccupantUnit(societyId,userId,unitId);
      const facts=await this.insights.residentGateStatus(societyId,userId,unitId);
      return this.auditedResponse(societyId,userId,unitId,'RESIDENT_GATE','RESIDENT_GATE',facts,['Visitor','VisitorPass'],'Grounded visitor and gate-pass status for the signed-in resident and selected property only.');
    }

    if(unitId && /utility|meter|consumption|reading|electricity|water usage|water meter/.test(routed)){
      this.requireTool(roles,'RESIDENT_UTILITIES');
      await this.assertCurrentOccupantUnit(societyId,userId,unitId);
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
      const facts=await this.insights.residentRequests(societyId,userId,unitId);
      return this.auditedResponse(
        societyId,userId,unitId,'RESIDENT_REQUESTS','RESIDENT_REQUESTS',facts,
        ['HelpdeskTicket'],
        'Grounded status of resident certificate and permission requests for the selected property. Society issuance/legal validity is not inferred.',
      );
    }

    if(unitId && /staff|domestic help|worker|workforce|maid|driver|household staff/.test(routed)){
      this.requireTool(roles,'RESIDENT_WORKFORCE');
      await this.assertCurrentOccupantUnit(societyId,userId,unitId);
      const facts=await this.workforce.residentStatusMine(societyId,userId,unitId);
      return this.auditedResponse(societyId,userId,unitId,'RESIDENT_WORKFORCE','RESIDENT_WORKFORCE',facts,['WorkforceAssignment','DomesticWorker','WorkforceLeave','AccessRequest','WorkforcePaymentRecord'],'Grounded household-staff status, gate-derived attendance and resident-recorded payment evidence for the current occupant of the selected property only. Scheduled evidence gaps are not labelled absence, and payment records are not bank/payroll proof.');
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
      return this.auditedResponse(societyId,userId,unitId,'RESIDENT_STATUS','RESIDENT_STATUS',facts,sources,residentAnswer(routed,facts,canReadPropertyPayables(roles)));
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

    // Distinguish an unsupported in-app topic from an off-topic question.
    const appRelated=/\b(?:society|community|resident|residents|household|family|members|parking|vehicle|vehicles|document|documents|profile|privacy|emergency|delivery|deliveries|notice|notices|gate|amenity|amenities|services|facility|facilities|billing)\b/.test(routed);
    return this.auditedResponse(
      societyId,userId,unitId,'UNSUPPORTED','UNSUPPORTED',
      {supported:this.tools(roles).tools.map(tool=>tool.label)},
      [],
      appRelated
        ? 'That Aaraagate topic is not available through this assistant yet. Please use the appropriate app screen. No information was invented.'
        : 'That question is outside Aaraagate Assistant’s scope. Please ask about authorized society or property information, such as dues, visitors, staff, complaints, amenities or notices.',
      'UNSUPPORTED',
    );
  }

  actionCentre(societyId:string,roles:readonly AppRole[]) {
    return this.actionCentreBuilder.build(societyId,roles);
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
    return {
      intent,answer,facts,sources,
      evidence:this.copilot.evidence(sources,facts),
      grounded:true,mutationPerformed:false,
    };
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

  async recordRecommendationOutcome(
    societyId:string,userId:string,roles:readonly AppRole[],
    recommendationKey:string,domain:string,status:RecommendationOutcomeStatus,note?:string,
  ){
    if(!this.canSeeActionDomain(roles,domain)) throw new ForbiddenException('Recommendation outcome is outside the caller operational scope');
    return this.copilot.recordOutcome(societyId,userId,recommendationKey,domain,status,note);
  }

  private async multiDomainSnapshot(societyId:string,tools:readonly AiAssistantToolId[],text:string){
    const domains:Record<string,unknown>={};
    const sources:Record<string,string[]>={};
    for(const tool of tools){
      if(tool==='SOCIETY_FINANCE'){
        domains[tool]=await this.insights.societyFinance(societyId,amountThresholdPaise(text));
        sources[tool]=['MaintenanceInvoice','Payment'];
      }else if(tool==='HELPDESK_OPERATIONS'){
        domains[tool]=await this.operations.operationsSummary(societyId);
        sources[tool]=['HelpdeskTicket'];
      }else if(tool==='FACILITIES'){
        domains[tool]=await this.insights.facilitiesSummary(societyId);
        sources[tool]=['FacilityAsset','FacilityWorkOrder','FacilityMaintenancePlan'];
      }else if(tool==='VENDORS'){
        domains[tool]=await this.insights.vendorSummary(societyId);
        sources[tool]=['SocietyVendor','ProcurementRequest'];
      }else if(tool==='SECURITY_EVENTS'){
        domains[tool]=await this.insights.securitySummary(societyId);
        sources[tool]=['SecurityEvent'];
      }else if(tool==='GOVERNANCE'){
        domains[tool]=await this.insights.governanceSummary(societyId);
        sources[tool]=['GovernanceMeeting','GovernanceResolution','GovernanceActionItem'];
      }
    }
    return {domains,sources};
  }

  private canSeeActionDomain(roles:readonly AppRole[],domain:string){
    const normalized=domain.trim().toUpperCase();
    if(normalized==='FINANCE')return hasPermission(roles,AppPermission.FINANCE_READ);
    if(normalized==='HELPDESK')return hasPermission(roles,AppPermission.HELPDESK_REVIEW);
    if(normalized==='GATE')return hasPermission(roles,AppPermission.GATE_ACCESS_PROCESS);
    if(normalized==='SECURITY')return hasPermission(roles,AppPermission.AUDIT_READ);
    if(normalized==='FACILITIES')return hasPermission(roles,AppPermission.FACILITIES_READ);
    if(normalized==='GOVERNANCE')return hasPermission(roles,AppPermission.GOVERNANCE_READ);
    if(normalized==='PROCUREMENT'||normalized==='VENDORS')return hasPermission(roles,AppPermission.SOCIETY_VENDORS_READ);
    return false;
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
          WHERE "societyId"=${societyId}::uuid AND "unitId"=${unitId}::uuid
            AND ${currentPayerPropertySql(societyId,userId,unitId)}
          ORDER BY "issuedAt" DESC LIMIT 20
        `)
      : [];
    const payments=canReadPropertyPayables(roles)
      ? await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
          SELECT p."id",p."invoiceId",p."amountPaise",p."status",p."createdAt",p."completedAt"
          FROM "Payment" p JOIN "MaintenanceInvoice" i ON i."id"=p."invoiceId" AND i."societyId"=p."societyId"
          WHERE p."societyId"=${societyId}::uuid AND i."unitId"=${unitId}::uuid
            AND p."payerUserId"=${userId}::uuid
            AND ${currentPayerPropertySql(societyId,userId,unitId)}
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

  private async assertCurrentOccupantUnit(societyId:string,userId:string,unitId:string){
    const rows=await this.prisma.$queryRaw<Array<{allowed:boolean}>>(Prisma.sql`
      SELECT TRUE AS "allowed" FROM "Unit" u
      WHERE u."id"=${unitId}::uuid AND u."societyId"=${societyId}::uuid
        AND ${currentOccupantPropertySql(societyId,userId,unitId)}
      LIMIT 1
    `);
    if(!rows[0]?.allowed) throw new ForbiddenException('Current occupant authorization required for private household activity');
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
