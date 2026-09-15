import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AccountingConnectorDeliveryView={
  id:string;
  exportJobId:string;
  provider:string;
  status:'QUEUED'|'PROCESSING'|'ACCEPTED'|'DELIVERED'|'FAILED'|'UNKNOWN';
  attemptCount:number;
  lastAttemptAt:Date|null;
  nextAttemptAt:Date|null;
  providerReceiptId:string|null;
  failureCode:string|null;
  failureMessage:string|null;
  createdAt:Date;
  updatedAt:Date;
  completedAt:Date|null;
};

@Injectable()
export class AccountingConnectorDeliveryService{
  constructor(private readonly prisma:PrismaService){}
  list(societyId:string){return this.prisma.$queryRaw<AccountingConnectorDeliveryView[]>(Prisma.sql`
    SELECT "id","exportJobId","provider","status","attemptCount","lastAttemptAt","nextAttemptAt","providerReceiptId","failureCode","failureMessage","createdAt","updatedAt","completedAt"
    FROM "AccountingConnectorDelivery"
    WHERE "societyId"=${societyId}::uuid
    ORDER BY "createdAt" DESC LIMIT 100
  `);}
}
