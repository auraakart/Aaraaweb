import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AiAssistantToolId } from './ai-assistant.policy';

export type CopilotEvidenceConfidence='HIGH'|'MEDIUM'|'LOW'|'INSUFFICIENT';
export type RecommendationOutcomeStatus='REVIEWED'|'ACTED'|'RESOLVED'|'DISMISSED';

type BaselineRow={
  helpdeskCurrent30:number;helpdeskPrevious30:number;
  facilitiesCorrectiveCurrent90:number;facilitiesCorrectivePrevious90:number;
  securityCurrent30:number;securityPrevious30:number;
  completedVisits30:number;visitorDwellP90Minutes:number|null;
};

export class AiCopilot {
  constructor(private readonly prisma:PrismaService){}

  plan(text:string,allowedTools:readonly string[]){
    const requested=/\b(why|compare|correlat(?:e|ion)|relationship|pattern|together|across|connected|related|root cause|what.*driv|reason)\b/i.test(text);
    const rules:Array<[AiAssistantToolId,RegExp]>=[
      ['SOCIETY_FINANCE',/finance|collection|overdue|arrears|maintenance due|payment/i],
      ['HELPDESK_OPERATIONS',/helpdesk|complaint|ticket|sla|resident issue/i],
      ['FACILITIES',/facility|facilities|asset|lift|elevator|pump|amc|maintenance|work order/i],
      ['VENDORS',/vendor|supplier|procurement|quotation|purchase request/i],
      ['SECURITY_EVENTS',/security|incident|session|revocation|replay/i],
      ['GOVERNANCE',/governance|committee|resolution|meeting|action item|agm|sgm/i],
    ];
    const mentioned=rules.filter(([,pattern])=>pattern.test(text)).map(([tool])=>tool);
    const selected=[...new Set(mentioned.filter(tool=>allowedTools.includes(tool)))];
    const omitted=[...new Set(mentioned.filter(tool=>!allowedTools.includes(tool)))];
    return {requested,mentioned,selected,omitted,multiDomain:requested&&selected.length>=2};
  }

  evidence(sources:string[],facts:unknown){
    const recordCount=this.recordCount(facts);
    const sourceCount=sources.length;
    const confidence:CopilotEvidenceConfidence=
      sourceCount===0?'INSUFFICIENT':
      recordCount===0?'LOW':
      sourceCount>=2?'HIGH':'MEDIUM';
    return {
      confidence,
      sourceCount,
      recordCount,
      asOf:new Date().toISOString(),
      freshness:'CURRENT_QUERY_SNAPSHOT' as const,
      causalClaim:false as const,
      boundary:'Confidence describes available Aaraagate evidence coverage, not the truth of an inferred physical or human cause.',
    };
  }

  async societyBaselines(societyId:string){
    const rows=await this.prisma.$queryRaw<BaselineRow[]>(Prisma.sql`
      SELECT
        (SELECT COUNT(*)::int FROM "HelpdeskTicket"
          WHERE "societyId"=${societyId}::uuid
            AND "createdAt">=CURRENT_TIMESTAMP-INTERVAL '30 days') AS "helpdeskCurrent30",
        (SELECT COUNT(*)::int FROM "HelpdeskTicket"
          WHERE "societyId"=${societyId}::uuid
            AND "createdAt"<CURRENT_TIMESTAMP-INTERVAL '30 days'
            AND "createdAt">=CURRENT_TIMESTAMP-INTERVAL '60 days') AS "helpdeskPrevious30",
        (SELECT COUNT(*)::int FROM "FacilityWorkOrder"
          WHERE "societyId"=${societyId}::uuid AND "workType"='CORRECTIVE'
            AND "createdAt">=CURRENT_TIMESTAMP-INTERVAL '90 days') AS "facilitiesCorrectiveCurrent90",
        (SELECT COUNT(*)::int FROM "FacilityWorkOrder"
          WHERE "societyId"=${societyId}::uuid AND "workType"='CORRECTIVE'
            AND "createdAt"<CURRENT_TIMESTAMP-INTERVAL '90 days'
            AND "createdAt">=CURRENT_TIMESTAMP-INTERVAL '180 days') AS "facilitiesCorrectivePrevious90",
        (SELECT COUNT(*)::int FROM "SecurityEvent"
          WHERE "societyId"=${societyId}::uuid
            AND "occurredAt">=CURRENT_TIMESTAMP-INTERVAL '30 days') AS "securityCurrent30",
        (SELECT COUNT(*)::int FROM "SecurityEvent"
          WHERE "societyId"=${societyId}::uuid
            AND "occurredAt"<CURRENT_TIMESTAMP-INTERVAL '30 days'
            AND "occurredAt">=CURRENT_TIMESTAMP-INTERVAL '60 days') AS "securityPrevious30",
        (SELECT COUNT(*)::int FROM "AccessRequest"
          WHERE "societyId"=${societyId}::uuid
            AND "enteredAt">=CURRENT_TIMESTAMP-INTERVAL '30 days'
            AND "enteredAt" IS NOT NULL AND "exitedAt" IS NOT NULL AND "exitedAt">="enteredAt") AS "completedVisits30",
        (SELECT ROUND(percentile_cont(0.9) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM ("exitedAt"-"enteredAt"))/60
          ))::int
          FROM "AccessRequest"
          WHERE "societyId"=${societyId}::uuid
            AND "enteredAt">=CURRENT_TIMESTAMP-INTERVAL '30 days'
            AND "enteredAt" IS NOT NULL AND "exitedAt" IS NOT NULL AND "exitedAt">="enteredAt") AS "visitorDwellP90Minutes"
    `);
    const row=rows[0]??{
      helpdeskCurrent30:0,helpdeskPrevious30:0,
      facilitiesCorrectiveCurrent90:0,facilitiesCorrectivePrevious90:0,
      securityCurrent30:0,securityPrevious30:0,
      completedVisits30:0,visitorDwellP90Minutes:null,
    };
    return {
      helpdesk:this.comparison('tickets created / 30d',Number(row.helpdeskCurrent30??0),Number(row.helpdeskPrevious30??0),Number(row.helpdeskCurrent30??0)+Number(row.helpdeskPrevious30??0)),
      facilities:this.comparison('corrective work orders / 90d',Number(row.facilitiesCorrectiveCurrent90??0),Number(row.facilitiesCorrectivePrevious90??0),Number(row.facilitiesCorrectiveCurrent90??0)+Number(row.facilitiesCorrectivePrevious90??0)),
      security:this.comparison('security events / 30d',Number(row.securityCurrent30??0),Number(row.securityPrevious30??0),Number(row.securityCurrent30??0)+Number(row.securityPrevious30??0)),
      gate:{
        metric:'visitor dwell p90',
        typical:Number(row.visitorDwellP90Minutes??0)||null,
        unit:'minutes',
        sampleSize:Number(row.completedVisits30??0),
        confidence:Number(row.completedVisits30??0)>=20?'HIGH':Number(row.completedVisits30??0)>=5?'MEDIUM':'LOW',
        fallbackSafetyThresholdMinutes:240,
        boundary:'Society history is context only. The four-hour gate operating threshold remains the safety default and is not relaxed by historical behavior.',
      },
    };
  }

  hypotheses(domains:Record<string,unknown>){
    const items:Array<{
      id:string;statement:string;confidence:'MEDIUM'|'LOW';
      supportingEvidence:string[];contradictingEvidence:string[];causalClaim:false;nextVerification:string;
    }>=[];
    const helpdesk=domains.HELPDESK_OPERATIONS as {breachedCount?:number;unassignedCount?:number}|undefined;
    const facilities=domains.FACILITIES as {overdueWorkOrders?:number;repeatedCorrectiveAssets90d?:number}|undefined;
    const vendors=domains.VENDORS as {submittedRequests?:number}|undefined;
    if(helpdesk&&facilities&&(Number(helpdesk.breachedCount??0)>0||Number(helpdesk.unassignedCount??0)>0)
      &&(Number(facilities.overdueWorkOrders??0)>0||Number(facilities.repeatedCorrectiveAssets90d??0)>0)){
      items.push({
        id:'helpdesk-facilities-coincidence',
        statement:'Resident-service pressure and facilities-maintenance pressure are elevated in the same current snapshot.',
        confidence:'MEDIUM',
        supportingEvidence:[
          `Helpdesk: ${Number(helpdesk.breachedCount??0)} breached and ${Number(helpdesk.unassignedCount??0)} unassigned.`,
          `Facilities: ${Number(facilities.overdueWorkOrders??0)} overdue work orders and ${Number(facilities.repeatedCorrectiveAssets90d??0)} repeatedly corrective assets.`,
        ],
        contradictingEvidence:['No entity-level causal link between a specific complaint and a specific asset failure is established by this aggregate comparison.'],
        causalClaim:false,
        nextVerification:'Filter complaints by facility/location and compare them with the corresponding asset work-order timeline before attributing a cause.',
      });
    }
    if(facilities&&vendors&&Number(facilities.overdueWorkOrders??0)>0&&Number(vendors.submittedRequests??0)>0){
      items.push({
        id:'facilities-procurement-coincidence',
        statement:'Facilities backlog and procurement review demand are elevated together.',
        confidence:'LOW',
        supportingEvidence:[
          `Facilities: ${Number(facilities.overdueWorkOrders??0)} overdue work orders.`,
          `Procurement: ${Number(vendors.submittedRequests??0)} submitted requests awaiting review.`,
        ],
        contradictingEvidence:['The submitted procurement requests are not proven to belong to the overdue facility work orders.'],
        causalClaim:false,
        nextVerification:'Review procurement references and facility work-order/vendor evidence together before linking the queues.',
      });
    }
    return items;
  }

  fingerprint(card:{id:string;domain:string;metrics:Record<string,unknown>}){
    const normalized=JSON.stringify({
      id:card.id,domain:card.domain,
      metrics:Object.fromEntries(Object.entries(card.metrics).sort(([a],[b])=>a.localeCompare(b))),
    });
    return `${card.id}:${createHash('sha256').update(normalized).digest('hex').slice(0,16)}`;
  }

  async latestOutcomes(societyId:string,keys:string[]){
    if(keys.length===0)return new Map<string,Record<string,unknown>>();
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      SELECT DISTINCT ON ("recommendationKey")
        "recommendationKey","domain","status","note","actorUserId","createdAt"
      FROM "AiAssistantRecommendationOutcome"
      WHERE "societyId"=${societyId}::uuid
        AND "recommendationKey" IN (${Prisma.join(keys)})
      ORDER BY "recommendationKey","createdAt" DESC,"id" DESC
    `);
    return new Map(rows.map(row=>[String(row.recommendationKey),row]));
  }

  async recordOutcome(
    societyId:string,userId:string,recommendationKey:string,domain:string,
    status:RecommendationOutcomeStatus,note?:string,
  ){
    const cleanKey=recommendationKey.trim();
    const cleanDomain=domain.trim().toUpperCase();
    const cleanNote=note?.trim()||null;
    if(!cleanKey||cleanKey.length>160)throw new Error('Recommendation key is invalid');
    if(!cleanDomain||cleanDomain.length>40)throw new Error('Recommendation domain is invalid');
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      INSERT INTO "AiAssistantRecommendationOutcome"
        ("societyId","actorUserId","recommendationKey","domain","status","note")
      VALUES (
        ${societyId}::uuid,${userId}::uuid,${cleanKey},${cleanDomain},${status},${cleanNote}
      )
      RETURNING "id","recommendationKey","domain","status","note","createdAt"
    `);
    return rows[0];
  }

  private comparison(metric:string,current:number,previous:number,sampleSize:number){
    const changePercent=previous>0?Math.round(((current-previous)/previous)*1000)/10:null;
    return {
      metric,current,typical:previous,changePercent,sampleSize,
      confidence:sampleSize>=20?'HIGH':sampleSize>=5?'MEDIUM':'LOW',
      basis:'SOCIETY_HISTORY' as const,
      window:'current period vs immediately preceding equal period',
    };
  }

  private recordCount(value:unknown):number{
    if(value==null)return 0;
    if(Array.isArray(value))return value.length;
    if(typeof value!=='object')return 1;
    let total=0;
    for(const item of Object.values(value as Record<string,unknown>)){
      if(Array.isArray(item))total+=item.length;
      else if(item&&typeof item==='object')total+=1;
      else if(item!==null&&item!==undefined)total+=1;
    }
    return total;
  }
}
