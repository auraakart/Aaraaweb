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
  | 'NOTICE_STATUS'
  | 'GATE_STATUS'
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
  {id:'NOTICE_STATUS',label:'Society notices',context:'PROPERTY',permissions:[AppPermission.NOTICE_READ],permissionMode:'ALL'},
  {id:'GATE_STATUS',label:'Gate and visitor status',context:'PROPERTY',permissions:[AppPermission.VISITOR_READ_OWN,AppPermission.ACCESS_READ_OWN],permissionMode:'ANY'},
  {id:'GOVERNANCE',label:'Governance evidence',context:'SOCIETY',permissions:[AppPermission.GOVERNANCE_READ],permissionMode:'ALL'},
] as const;

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

    if(this.promptInjectionAttempt(normalized)){
      return this.auditedResponse(
        societyId,userId,unitId,'UNSUPPORTED','UNSUPPORTED',{},[],
        'Request instructions cannot override Aaraagate permissions, tenant scope, tool policy or confirmation requirements. No tool was invoked.',
        'BLOCKED',
      );
    }

    if(/notice|announcement|society update|community update/.test(normalized)){
      if(!unitId) throw new BadRequestException('A current property context is required for resident notice status');
      this.requireTool(roles,'NOTICE_STATUS');
      await this.assertResidentUnit(societyId,userId,unitId);
      const facts=await this.noticeStatus(societyId,roles);
      return this.auditedResponse(
        societyId,userId,unitId,'NOTICE_STATUS','NOTICE_STATUS',facts,['Notice'],
        'Grounded published notices visible to the selected resident property context.',
      );
    }

    if(/gate|visitor|entry|access request|delivery|cab/.test(normalized)){
      if(!unitId) throw new BadRequestException('A current property context is required for resident gate status');
      this.requireTool(roles,'GATE_STATUS');
      await this.assertResidentUnit(societyId,userId,unitId);
      const facts=await this.gateStatus(societyId,userId,unitId,roles);
      const sources=[
        ...(hasPermission(roles,AppPermission.VISITOR_READ_OWN)?['Visitor','VisitorPass']:[]),
        ...(hasPermission(roles,AppPermission.ACCESS_READ_OWN)?['AccessRequest']:[]),
      ];
      return this.auditedResponse(
        societyId,userId,unitId,'GATE_STATUS','GATE_STATUS',facts,sources,
        'Grounded gate and visitor status for the selected property and signed-in resident only.',
      );
    }

    if(/governance|committee|meeting|resolution|minutes|action item/.test(normalized)){
      this.requireTool(roles,'GOVERNANCE');
      const facts=await this.governanceSummary(societyId);
      return this.auditedResponse(
        societyId,userId,unitId,'GOVERNANCE','GOVERNANCE',facts,
        ['GovernanceMeeting','GovernanceResolution','GovernanceActionItem'],
        'Grounded governance evidence from current society records. This summary is descriptive and does not determine legal validity or statutory compliance.',
      );
    }

    if(unitId && /due|maintenance|invoice|receipt|payment|booking|status|complaint|ticket/.test(normalized)){
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

    if(/overdue|collection|ageing|aging|arrears|maintenance due/.test(normalized)){
      this.requireTool(roles,'SOCIETY_FINANCE');
      const thresholdPaise=this.amountThresholdPaise(text);
      const facts=await this.societyFinance(societyId,thresholdPaise);
      return this.auditedResponse(
        societyId,userId,unitId,'SOCIETY_FINANCE','SOCIETY_FINANCE',facts,['MaintenanceInvoice','Payment'],
        `Grounded finance summary from current society accounting data${thresholdPaise? ` for overdue amounts of at least ₹${(thresholdPaise/100).toLocaleString('en-IN')}`:''}.`,
      );
    }

    if(/sla|helpdesk|complaint|ticket/.test(normalized)){
      this.requireTool(roles,'HELPDESK_OPERATIONS');
      const facts=await this.operations.operationsSummary(societyId);
      return this.auditedResponse(societyId,userId,unitId,'HELPDESK_OPERATIONS','HELPDESK_OPERATIONS',facts,['HelpdeskTicket'],'Grounded helpdesk summary from open society tickets and SLA state.');
    }

    if(/security|incident|session|revocation|replay/.test(normalized)){
      this.requireTool(roles,'SECURITY_EVENTS');
      const facts=await this.securitySummary(societyId);
      return this.auditedResponse(societyId,userId,unitId,'SECURITY_EVENTS','SECURITY_EVENTS',facts,['SecurityEvent'],'Grounded security summary from privacy-minimal society security events.');
    }

    if(/facility|facilities|asset|work order|amc|preventive maintenance/.test(normalized)){
      this.requireTool(roles,'FACILITIES');
      const facts=await this.facilitiesSummary(societyId);
      return this.auditedResponse(societyId,userId,unitId,'FACILITIES','FACILITIES',facts,['FacilityAsset','FacilityWorkOrder','FacilityMaintenancePlan'],'Grounded facility summary from current society operations data.');
    }

    if(/vendor|procurement|purchase request|supplier/.test(normalized)){
      this.requireTool(roles,'VENDORS');
      const facts=await this.vendorSummary(societyId);
      return this.auditedResponse(societyId,userId,unitId,'VENDORS','VENDORS',facts,['SocietyVendor','ProcurementRequest'],'Grounded vendor/procurement summary from current society records.');
    }

    if(/amenity|service|provider|plumber|electrician|cleaning/.test(normalized)){
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
      id:string;domain:string;severity:'LOW'|'MEDIUM'|'HIGH';title:string;summary:string;prompt:string;sources:string[];metrics:Record<string,number|string|null>;
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
      });
    }

    const rank={HIGH:0,MEDIUM:1,LOW:2} as const;
    cards.sort((a,b)=>rank[a.severity]-rank[b.severity]||a.domain.localeCompare(b.domain));
    return {cards,grounded:true,mutationPerformed:false};
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

  private async noticeStatus(societyId:string,roles:readonly AppRole[]){
    const ownerVisible=roles.includes(AppRole.OWNER);
    const notices=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      SELECT "id","title","body","category","audience","publishedAt","expiresAt"
      FROM "Notice"
      WHERE "societyId"=${societyId}::uuid
        AND "status"='PUBLISHED'
        AND "archivedAt" IS NULL
        AND ("expiresAt" IS NULL OR "expiresAt">CURRENT_TIMESTAMP)
        AND ("audience"='OWNER_AND_OCCUPANTS' OR (${ownerVisible}=TRUE AND "audience"='OWNER_ONLY'))
      ORDER BY "publishedAt" DESC NULLS LAST,"createdAt" DESC
      LIMIT 20
    `);
    return {visibleNotices:notices};
  }

  private async gateStatus(societyId:string,userId:string,unitId:string,roles:readonly AppRole[]){
    const visitors=hasPermission(roles,AppPermission.VISITOR_READ_OWN)
      ? await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
          SELECT v."id",v."name",v."purpose",v."status",v."createdAt",
                 vp."id" AS "passId",vp."status" AS "passStatus",vp."validFrom",vp."validUntil",vp."checkedInAt",vp."checkedOutAt"
          FROM "Visitor" v
          LEFT JOIN "VisitorPass" vp ON vp."visitorId"=v."id" AND vp."societyId"=v."societyId"
          WHERE v."societyId"=${societyId}::uuid AND v."unitId"=${unitId}::uuid AND v."hostUserId"=${userId}::uuid
          ORDER BY v."createdAt" DESC,vp."createdAt" DESC NULLS LAST
          LIMIT 20
        `)
      : [];
    const accessRequests=hasPermission(roles,AppPermission.ACCESS_READ_OWN)
      ? await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
          SELECT "id","subjectType","subjectName","purpose","status","validFrom","validUntil","enteredAt","exitedAt","createdAt"
          FROM "AccessRequest"
          WHERE "societyId"=${societyId}::uuid AND "unitId"=${unitId}::uuid AND "requestedById"=${userId}::uuid
          ORDER BY "createdAt" DESC
          LIMIT 20
        `)
      : [];
    return {visitors,accessRequests};
  }

  private async governanceSummary(societyId:string){
    const [meetings,resolutions,actions]=await Promise.all([
      this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        SELECT "id","meetingType","status","title","scheduledAt","heldAt","location","quorumRequired","quorumPresent","quorumRuleReference","byeLawReference","minutesSummary"
        FROM "GovernanceMeeting"
        WHERE "societyId"=${societyId}::uuid
        ORDER BY "scheduledAt" DESC
        LIMIT 20
      `),
      this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        SELECT "id","meetingId","title","status","approvalRequired","approvalRecorded","approvalRuleReference","byeLawReference","recordedAt"
        FROM "GovernanceResolution"
        WHERE "societyId"=${societyId}::uuid
        ORDER BY "recordedAt" DESC
        LIMIT 40
      `),
      this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        SELECT "id","meetingId","title","ownerUserId","dueAt","status","completedAt","createdAt"
        FROM "GovernanceActionItem"
        WHERE "societyId"=${societyId}::uuid AND "status" NOT IN ('COMPLETED','CANCELLED')
        ORDER BY "dueAt" ASC NULLS LAST,"createdAt" ASC
        LIMIT 40
      `),
    ]);
    return {
      meetings,
      proposedResolutions:resolutions.filter(row=>row.status==='PROPOSED'),
      openActions:actions,
      boundary:'Descriptive repository evidence only; legal validity, statutory compliance, quorum law and resolution validity remain outside this assistant.',
    };
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
