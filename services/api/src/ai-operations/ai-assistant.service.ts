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
  | 'UNSUPPORTED';

@Injectable()
export class AiAssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: AiOperationsService,
  ) {}

  async query(societyId:string,userId:string,roles:readonly AppRole[],message:string,unitId?:string) {
    const text=message.trim();
    if(text.length<2||text.length>1000) throw new BadRequestException('Assistant message must be between 2 and 1000 characters');
    const normalized=text.toLowerCase();

    if(/overdue|collection|ageing|aging|arrears|maintenance due/.test(normalized) && hasPermission(roles,AppPermission.FINANCE_READ)){
      const thresholdPaise=this.amountThresholdPaise(text);
      const facts=await this.societyFinance(societyId,thresholdPaise);
      return this.response('SOCIETY_FINANCE',facts,[
        'MaintenanceInvoice','Payment'
      ],`Grounded finance summary from current society accounting data${thresholdPaise? ` for overdue amounts of at least ₹${(thresholdPaise/100).toLocaleString('en-IN')}`:''}.`);
    }

    if(/sla|helpdesk|complaint|ticket/.test(normalized) && hasPermission(roles,AppPermission.HELPDESK_REVIEW)){
      const facts=await this.operations.operationsSummary(societyId);
      return this.response('HELPDESK_OPERATIONS',facts,['HelpdeskTicket'],'Grounded helpdesk summary from open society tickets and SLA state.');
    }

    if(/security|incident|session|revocation|replay/.test(normalized)){
      this.require(roles,AppPermission.AUDIT_READ);
      const facts=await this.securitySummary(societyId);
      return this.response('SECURITY_EVENTS',facts,['SecurityEvent'],'Grounded security summary from privacy-minimal society security events.');
    }

    if(/facility|facilities|asset|work order|amc|preventive maintenance/.test(normalized)){
      this.require(roles,AppPermission.FACILITIES_READ);
      const facts=await this.facilitiesSummary(societyId);
      return this.response('FACILITIES',facts,['FacilityAsset','FacilityWorkOrder','FacilityMaintenancePlan'],'Grounded facility summary from current society operations data.');
    }

    if(/vendor|procurement|purchase request|supplier/.test(normalized)){
      this.require(roles,AppPermission.SOCIETY_VENDORS_READ);
      const facts=await this.vendorSummary(societyId);
      return this.response('VENDORS',facts,['SocietyVendor','ProcurementRequest'],'Grounded vendor/procurement summary from current society records.');
    }

    if(/amenity|service|provider|plumber|electrician|cleaning/.test(normalized)){
      if(!hasPermission(roles,AppPermission.AMENITY_READ)&&!hasPermission(roles,AppPermission.SERVICES_MARKETPLACE_USE)){
        throw new ForbiddenException('Assistant discovery is not permitted for this role');
      }
      if(unitId) await this.assertResidentUnit(societyId,userId,unitId);
      const facts=await this.discovery(societyId);
      return this.response('DISCOVERY',facts,['Amenity','ServiceOffering','ServiceProviderSociety'],'Grounded discovery from active amenities and approved society service offerings.');
    }

    if(/due|invoice|receipt|payment|booking|status|my complaint|my ticket/.test(normalized)){
      if(!unitId) throw new BadRequestException('A current property context is required for resident assistant status');
      if(!hasPermission(roles,AppPermission.HELPDESK_READ_OWN)&&!hasPermission(roles,AppPermission.PROPERTY_FINANCE_READ)&&!hasPermission(roles,AppPermission.AMENITY_READ)){
        throw new ForbiddenException('Resident assistant status is not permitted for this role');
      }
      await this.assertResidentUnit(societyId,userId,unitId);
      const facts=await this.residentStatus(societyId,userId,unitId,roles);
      const sources=[
        ...(hasPermission(roles,AppPermission.PROPERTY_FINANCE_READ)?['MaintenanceInvoice','Payment']:[]),
        ...(hasPermission(roles,AppPermission.HELPDESK_READ_OWN)?['HelpdeskTicket']:[]),
        ...(hasPermission(roles,AppPermission.AMENITY_READ)?['AmenityBooking']:[]),
        ...(hasPermission(roles,AppPermission.SERVICES_MARKETPLACE_USE)?['ServiceBooking']:[]),
      ];
      return this.response('RESIDENT_STATUS',facts,sources,'Grounded status for the selected property only.');
    }

    return this.response('UNSUPPORTED',{
      supported:['maintenance/collection/arrears','helpdesk/SLA','security incidents','facilities/AMCs/work orders','vendors/procurement','amenities/services','resident payment/booking/complaint status'],
    },[],'I could not map that request to an approved Aaraagate AI tool. No answer was invented and no mutation was attempted.');
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
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      SELECT "id","actorUserId","action","status","confirmedAt","executedAt","createdAt","updatedAt"
      FROM "AiOperationProposal"
      WHERE "societyId"=${societyId}::uuid
      ORDER BY "createdAt" DESC,"id" DESC
      OFFSET ${offset} LIMIT ${pageSize}
    `);
    return {page,pageSize,items:rows};
  }

  private response(intent:AiAssistantIntent,facts:unknown,sources:string[],answer:string){
    return {intent,answer,facts,sources,grounded:true,mutationPerformed:false};
  }

  private require(roles:readonly AppRole[],permission:AppPermission){
    if(!hasPermission(roles,permission)) throw new ForbiddenException(`Assistant tool requires ${permission}`);
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
