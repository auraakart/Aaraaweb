import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerProviderOperatorService } from './consumer-provider-operator.service';

type DisputeEvidenceRow = {
  id:string;disputeId:string;actorType:'RESIDENT'|'PROVIDER';
  note:string;reference:string|null;idempotencyKey?:string;createdAt:Date;
};

/** Dispute thread access and retry-safe evidence, retaining the original owner boundary. */
export class ServiceDisputeEvidence {
  constructor(private readonly prisma: PrismaService, private readonly operators: ConsumerProviderOperatorService) {}

  /** Every read and write is authorized against the original dispute owner. */
  async listDisputeEvidence(userId:string,disputeId:string,actorType:'RESIDENT'|'PROVIDER',bookingId?:string){
    const provider=actorType==='PROVIDER'?await this.operators.resolveProvider(userId):null;
    const disputes=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`
      SELECT "id" FROM "ConsumerServiceDispute"
      WHERE "id"=${disputeId}::uuid
        ${actorType==='RESIDENT'
          ?Prisma.sql`AND "userId"=${userId}::uuid AND "bookingId"=${bookingId}::uuid`
          :Prisma.sql`AND "providerId"=${provider!.providerId}::uuid`}
      LIMIT 1
    `);
    if(!disputes.length)throw new NotFoundException('Service dispute not found');
    return this.prisma.$queryRaw<DisputeEvidenceRow[]>(Prisma.sql`
      SELECT "id","disputeId","actorType","note","reference","createdAt"
      FROM "ConsumerServiceDisputeEvidence" WHERE "disputeId"=${disputeId}::uuid
      ORDER BY "createdAt" DESC,"id" DESC LIMIT 100
    `);
  }

  async addDisputeEvidence(userId:string,disputeId:string,actorType:'RESIDENT'|'PROVIDER',
    note:string,idempotencyKey:string,reference?:string,bookingId?:string){
    const normalizedNote=note?.trim()??'';
    const normalizedReference=reference?.trim()||null;
    const key=idempotencyKey?.trim()??'';
    if(normalizedNote.length<5||normalizedNote.length>2000)
      throw new BadRequestException('Evidence note must be 5–2000 characters');
    if(normalizedReference && normalizedReference.length>400)
      throw new BadRequestException('Evidence reference must be at most 400 characters');
    if(key.length<8||key.length>120)
      throw new BadRequestException('Evidence retry identity must be 8–120 characters');
    const provider=actorType==='PROVIDER'?await this.operators.resolveProvider(userId):null;
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<Array<{id:string;status:string}>>(Prisma.sql`
        SELECT "id","status" FROM "ConsumerServiceDispute"
        WHERE "id"=${disputeId}::uuid
          ${actorType==='RESIDENT'
            ?Prisma.sql`AND "userId"=${userId}::uuid AND "bookingId"=${bookingId}::uuid`
            :Prisma.sql`AND "providerId"=${provider!.providerId}::uuid`}
        FOR UPDATE
      `);
      if(!rows.length)throw new NotFoundException('Service dispute not found');
      const previous=await tx.$queryRaw<DisputeEvidenceRow[]>(Prisma.sql`
        SELECT "id","disputeId","actorType","note","reference","idempotencyKey","createdAt"
        FROM "ConsumerServiceDisputeEvidence" WHERE "disputeId"=${disputeId}::uuid
          AND "actorUserId"=${userId}::uuid AND "idempotencyKey"=${key} LIMIT 1
      `);
      if(previous.length){
        if(previous[0].note!==normalizedNote||previous[0].reference!==normalizedReference||
           previous[0].actorType!==actorType)
          throw new ConflictException('Evidence retry identity is bound to another note');
        return previous[0]; // Exact replay, even if case closed after submission.
      }
      if(!['OPEN','UNDER_REVIEW'].includes(rows[0].status))
        throw new BadRequestException('Evidence can be added only while a dispute is open');
      const created=await tx.$queryRaw<DisputeEvidenceRow[]>(Prisma.sql`
        INSERT INTO "ConsumerServiceDisputeEvidence"
          ("id","disputeId","actorUserId","actorType","note","reference","idempotencyKey")
        VALUES (${randomUUID()}::uuid,${disputeId}::uuid,${userId}::uuid,
          ${actorType},${normalizedNote},${normalizedReference},${key})
        RETURNING "id","disputeId","actorType","note","reference","createdAt"
      `);
      return created[0];
    });
  }

  async listPlatformDisputeEvidence(disputeId:string){
    const rows=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`
      SELECT "id" FROM "ConsumerServiceDispute" WHERE "id"=${disputeId}::uuid LIMIT 1
    `);
    if(!rows.length)throw new NotFoundException('Service dispute not found');
    return this.prisma.$queryRaw<DisputeEvidenceRow[]>(Prisma.sql`
      SELECT "id","disputeId","actorType","note","reference","createdAt"
      FROM "ConsumerServiceDisputeEvidence" WHERE "disputeId"=${disputeId}::uuid
      ORDER BY "createdAt" DESC,"id" DESC LIMIT 100
    `);
  }

}
