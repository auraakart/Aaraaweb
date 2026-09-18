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
