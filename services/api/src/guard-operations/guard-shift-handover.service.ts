import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type ShiftHandoverInput={gateId?:string;summary:string;openItems?:string[]};

@Injectable()
export class GuardShiftHandoverService {
  constructor(private readonly prisma:PrismaService) {}

  list(societyId:string){
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT h."id",h."gateId",h."outgoingGuardUserId",h."incomingGuardUserId",h."summary",h."openItems",h."status",h."createdAt",h."acknowledgedAt",
             g."name" AS "gateName",outgoing."name" AS "outgoingGuardName",incoming."name" AS "incomingGuardName"
      FROM "GuardShiftHandover" h
      LEFT JOIN "Gate" g ON g."id"=h."gateId" AND g."societyId"=h."societyId"
      LEFT JOIN "User" outgoing ON outgoing."id"=h."outgoingGuardUserId"
      LEFT JOIN "User" incoming ON incoming."id"=h."incomingGuardUserId"
      WHERE h."societyId"=${societyId}::uuid
      ORDER BY CASE h."status" WHEN 'OPEN' THEN 0 ELSE 1 END,h."createdAt" DESC
      LIMIT 100
    `);
  }

  async commandSummary(societyId:string){
    const rows=await this.prisma.$queryRaw<Array<{
      openHandovers:number;handoverOlder30m:number;openIncidents:number;criticalIncidents:number;criticalIncidentOlder30m:number;gatesWithOpenIncidents:number;overstays:number;stalePatrol:number;activeDenyWatchlist:number;
    }>>(Prisma.sql`
      SELECT
        (SELECT COUNT(*)::int FROM "GuardShiftHandover" WHERE "societyId"=${societyId}::uuid AND "status"='OPEN') AS "openHandovers",
        (SELECT COUNT(*)::int FROM "GuardShiftHandover" WHERE "societyId"=${societyId}::uuid AND "status"='OPEN' AND "createdAt"<CURRENT_TIMESTAMP-INTERVAL '30 minutes') AS "handoverOlder30m",
        (SELECT COUNT(*)::int FROM "SecurityIncident" WHERE "societyId"=${societyId}::uuid AND "status"='OPEN') AS "openIncidents",
        (SELECT COUNT(*)::int FROM "SecurityIncident" WHERE "societyId"=${societyId}::uuid AND "status"='OPEN' AND "severity"='CRITICAL') AS "criticalIncidents",
        (SELECT COUNT(*)::int FROM "SecurityIncident" WHERE "societyId"=${societyId}::uuid AND "status"='OPEN' AND "severity"='CRITICAL' AND "createdAt"<CURRENT_TIMESTAMP-INTERVAL '30 minutes') AS "criticalIncidentOlder30m",
        (SELECT COUNT(DISTINCT "gateId")::int FROM "SecurityIncident" WHERE "societyId"=${societyId}::uuid AND "status"='OPEN' AND "gateId" IS NOT NULL) AS "gatesWithOpenIncidents",
        (SELECT COUNT(*)::int FROM "AccessRequest" WHERE "societyId"=${societyId}::uuid AND "status"='CHECKED_IN' AND "enteredAt"<CURRENT_TIMESTAMP-INTERVAL '4 hours' AND "exitedAt" IS NULL) AS "overstays",
        (SELECT COUNT(*)::int FROM "PatrolCheckpoint" c WHERE c."societyId"=${societyId}::uuid AND c."active"=TRUE AND
          NOT EXISTS (SELECT 1 FROM "PatrolScan" s WHERE s."societyId"=c."societyId" AND s."checkpointId"=c."id" AND s."scannedAt">=CURRENT_TIMESTAMP-INTERVAL '8 hours')) AS "stalePatrol",
        (SELECT COUNT(*)::int FROM "GuardWatchlistEntry" WHERE "societyId"=${societyId}::uuid AND "active"=TRUE AND "kind"='DENY'
          AND ("validFrom" IS NULL OR "validFrom"<=CURRENT_TIMESTAMP) AND ("validUntil" IS NULL OR "validUntil">CURRENT_TIMESTAMP)) AS "activeDenyWatchlist"
    `);
    const metrics=rows[0]??{openHandovers:0,handoverOlder30m:0,openIncidents:0,criticalIncidents:0,criticalIncidentOlder30m:0,gatesWithOpenIncidents:0,overstays:0,stalePatrol:0,activeDenyWatchlist:0};
    const priority=metrics.criticalIncidents>0?'CRITICAL':metrics.overstays>0||metrics.openIncidents>0?'HIGH':metrics.openHandovers>0||metrics.stalePatrol>0||metrics.activeDenyWatchlist>0?'ELEVATED':'CLEAR';
    const continuityStatus=metrics.criticalIncidentOlder30m>0?'SUPERVISOR_ATTENTION':metrics.handoverOlder30m>0?'HANDOVER_DUE':'CLEAR';
    const nextActions:string[]=[];
    if(metrics.criticalIncidentOlder30m>0)nextActions.push('Supervisor must acknowledge critical incidents that remain open beyond 30 minutes.');
    else if(metrics.criticalIncidents>0)nextActions.push('Review critical incidents first and record the supervisor response.');
    if(metrics.overstays>0)nextActions.push('Verify unresolved overstays and escalate through the existing incident workflow.');
    if(metrics.openHandovers>0)nextActions.push('Incoming guard must review and acknowledge open shift handovers.');
    if(metrics.stalePatrol>0)nextActions.push('Restore patrol evidence for stale checkpoints.');
    if(metrics.activeDenyWatchlist>0)nextActions.push('Continue exact-match watchlist screening before resident approval creation.');
    if(nextActions.length===0)nextActions.push('Continue routine gate processing and patrol cadence.');
    return {
      ...metrics,
      priority,continuityStatus,
      operatingMode:metrics.criticalIncidents>0?'EMERGENCY_ATTENTION':priority==='CLEAR'?'NORMAL':'ELEVATED',
      multiGateAttention:metrics.gatesWithOpenIncidents>1,
      clientOfflineQueueVisibility:'DEVICE_LOCAL_ONLY',
      automaticModeChange:false,
      nextActions,
      fallbackPolicy:{residentResponse:'PUSH_THEN_IVR_SIMULATOR_OR_MANUAL',accessDevice:'FAIL_CLOSED_OR_MANUAL',automaticAccessGrant:false},
      boundary:'Current-state command guidance only. It does not infer identity, automatically change access state, or bypass resident/supervisor authorization.',
      generatedAt:new Date().toISOString(),
    };
  }

  async create(societyId:string,userId:string,input:ShiftHandoverInput){
    const summary=input.summary.trim();
    if(summary.length<3||summary.length>2000) throw new BadRequestException('Shift handover summary must be between 3 and 2000 characters');
    if(input.gateId) await this.assertGate(societyId,input.gateId);
    const openItems=(input.openItems??[]).map(item=>item.trim()).filter(Boolean).slice(0,50);
    if(openItems.some(item=>item.length>300)) throw new BadRequestException('Each open handover item must be 300 characters or fewer');
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      INSERT INTO "GuardShiftHandover" ("societyId","gateId","outgoingGuardUserId","summary","openItems")
      VALUES (${societyId}::uuid,${input.gateId??null}::uuid,${userId}::uuid,${summary},${JSON.stringify(openItems)}::jsonb)
      RETURNING "id","gateId","outgoingGuardUserId","summary","openItems","status","createdAt"
    `);
    return rows[0];
  }

  async acknowledge(societyId:string,userId:string,id:string){
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      UPDATE "GuardShiftHandover"
      SET "status"='ACKNOWLEDGED',"incomingGuardUserId"=${userId}::uuid,"acknowledgedByUserId"=${userId}::uuid,"acknowledgedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid AND "status"='OPEN' AND "outgoingGuardUserId"<>${userId}::uuid
      RETURNING "id","status","incomingGuardUserId","acknowledgedAt"
    `);
    if(!rows.length) throw new ConflictException('Open shift handover not found or cannot be acknowledged by the outgoing guard');
    return rows[0];
  }

  private async assertGate(societyId:string,gateId:string){
    const rows=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`
      SELECT "id" FROM "Gate" WHERE "id"=${gateId}::uuid AND "societyId"=${societyId}::uuid AND "active"=true LIMIT 1
    `);
    if(!rows.length) throw new BadRequestException('Gate does not belong to the active society');
  }
}
