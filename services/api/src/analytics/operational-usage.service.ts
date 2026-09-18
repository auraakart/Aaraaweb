import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export type OperationalUsageEventType =
  | 'PROPERTY_CONTEXT_SWITCHED'
  | 'SERVICE_DISCOVERY_VIEWED'
  | 'INDEPENDENT_HOME_ENTERED';

@Injectable()
export class OperationalUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async record(userId:string,societyId:string|undefined,eventType:OperationalUsageEventType) {
    const subjectHash=createHash('sha256').update(userId).digest('hex');
    if(societyId){
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO "OperationalUsageEvent" ("societyId","eventType","subjectHash","bucketDate")
        VALUES (${societyId}::uuid,${eventType},${subjectHash},CURRENT_DATE)
        ON CONFLICT ("societyId","eventType","subjectHash","bucketDate")
          WHERE "societyId" IS NOT NULL
        DO NOTHING
      `);
    }else{
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO "OperationalUsageEvent" ("societyId","eventType","subjectHash","bucketDate")
        VALUES (NULL,${eventType},${subjectHash},CURRENT_DATE)
      `);
    }
  }
  async recordGuardSync(societyId:string,input:{considered:number;synced:number;retried:number;unresolved:number;reviewRequired:number}) {
    const values=[input.considered,input.synced,input.retried,input.unresolved,input.reviewRequired];
    if(values.some(value=>!Number.isSafeInteger(value)||value<0)) return;
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "GuardOfflineSyncMetric" (
        "societyId","bucketDate","syncRuns","actionsConsidered","actionsSynced","actionsRetried","actionsUnresolved","reviewRequired"
      ) VALUES (
        ${societyId}::uuid,CURRENT_DATE,1,${input.considered},${input.synced},${input.retried},${input.unresolved},${input.reviewRequired}
      )
      ON CONFLICT ("societyId","bucketDate") DO UPDATE SET
        "syncRuns"="GuardOfflineSyncMetric"."syncRuns"+1,
        "actionsConsidered"="GuardOfflineSyncMetric"."actionsConsidered"+EXCLUDED."actionsConsidered",
        "actionsSynced"="GuardOfflineSyncMetric"."actionsSynced"+EXCLUDED."actionsSynced",
        "actionsRetried"="GuardOfflineSyncMetric"."actionsRetried"+EXCLUDED."actionsRetried",
        "actionsUnresolved"="GuardOfflineSyncMetric"."actionsUnresolved"+EXCLUDED."actionsUnresolved",
        "reviewRequired"="GuardOfflineSyncMetric"."reviewRequired"+EXCLUDED."reviewRequired",
        "updatedAt"=CURRENT_TIMESTAMP
    `);
  }
}
