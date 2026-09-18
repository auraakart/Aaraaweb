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
}
