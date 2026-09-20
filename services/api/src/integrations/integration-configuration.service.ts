import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { IntegrationFamily } from './integration-registry.service';

const FAMILIES: readonly IntegrationFamily[] = ['OTP','PUSH','PAYMENT_GATEWAY','ACCESS_CONTROL','OBJECT_STORAGE','SMART_METER','ACCOUNTING_CONNECTOR'];

type ConfigurationRow = { societyId:string; family:IntegrationFamily; providerKey:string; enabled:boolean; updatedByUserId:string; createdAt:Date; updatedAt:Date };

@Injectable()
export class IntegrationConfigurationService {
  constructor(private readonly prisma: PrismaService) {}

  list(societyId:string) {
    return this.prisma.$queryRaw<ConfigurationRow[]>(Prisma.sql`
      SELECT "societyId","family","providerKey","enabled","updatedByUserId","createdAt","updatedAt"
      FROM "SocietyIntegrationConfiguration"
      WHERE "societyId"=${societyId}::uuid
      ORDER BY "family"
    `);
  }

  events(societyId:string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT "id","family","eventType","providerKey","enabled","actorUserId","occurredAt"
      FROM "SocietyIntegrationConfigurationEvent"
      WHERE "societyId"=${societyId}::uuid
      ORDER BY "occurredAt" DESC,"id" DESC LIMIT 500
    `);
  }

  async update(societyId:string,actorUserId:string,input:{family:IntegrationFamily;providerKey:string;enabled:boolean}) {
    if(!FAMILIES.includes(input.family)) throw new BadRequestException('Unsupported integration family');
    const providerKey=input.providerKey.trim().toLowerCase();
    if(!providerKey||providerKey.length>80) throw new BadRequestException('Provider key must be between 1 and 80 characters');
    if(/(secret|token|password|credential|api[_-]?key|private[_-]?key|bearer)/i.test(providerKey)) throw new BadRequestException('Provider key must identify a provider and must not contain secret material');

    return this.prisma.$transaction(async tx=>{
      const current=await tx.$queryRaw<ConfigurationRow[]>(Prisma.sql`
        SELECT "societyId","family","providerKey","enabled","updatedByUserId","createdAt","updatedAt"
        FROM "SocietyIntegrationConfiguration"
        WHERE "societyId"=${societyId}::uuid AND "family"=${input.family}
        FOR UPDATE
      `);
      const previous=current[0];
      const eventType=!previous?'CONFIGURED':previous.providerKey!==providerKey?'PROVIDER_CHANGED':previous.enabled!==input.enabled?(input.enabled?'ENABLED':'DISABLED'):null;

      const rows=await tx.$queryRaw<ConfigurationRow[]>(Prisma.sql`
        INSERT INTO "SocietyIntegrationConfiguration" ("societyId","family","providerKey","enabled","updatedByUserId")
        VALUES (${societyId}::uuid,${input.family},${providerKey},${input.enabled},${actorUserId}::uuid)
        ON CONFLICT ("societyId","family") DO UPDATE SET
          "providerKey"=EXCLUDED."providerKey","enabled"=EXCLUDED."enabled","updatedByUserId"=EXCLUDED."updatedByUserId","updatedAt"=CURRENT_TIMESTAMP
        RETURNING "societyId","family","providerKey","enabled","updatedByUserId","createdAt","updatedAt"
      `);

      if(eventType) await tx.$executeRaw(Prisma.sql`
        INSERT INTO "SocietyIntegrationConfigurationEvent" ("societyId","family","eventType","providerKey","enabled","actorUserId")
        VALUES (${societyId}::uuid,${input.family},${eventType},${providerKey},${input.enabled},${actorUserId}::uuid)
      `);
      return {...rows[0],changed:Boolean(eventType)};
    });
  }
}