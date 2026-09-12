import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UnitRelation } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Kind='MOVE_IN'|'MOVE_OUT';
type Status='REQUESTED'|'APPROVED'|'REJECTED'|'COMPLETED'|'CANCELLED';
type CreateMoveIn={unitId:string;userId:string;relation:UnitRelation;effectiveAt:Date;reason?:string};
type CreateMoveOut={occupancyId:string;effectiveAt:Date;reason?:string};

type LifecycleRow={id:string;societyId:string;unitId:string;userId:string;occupancyId:string|null;kind:Kind;relation:UnitRelation;status:Status;effectiveAt:Date;reason:string|null};

@Injectable()
export class OccupancyLifecycleService{
  constructor(private readonly prisma:PrismaService){}

  list(societyId:string){return this.prisma.$queryRaw(Prisma.sql`
    SELECT r."id",r."unitId",r."userId",r."occupancyId",r."kind",r."relation",r."status",r."effectiveAt",r."reason",
           r."requestedByUserId",r."reviewedByUserId",r."reviewedAt",r."completedAt",r."createdAt",r."updatedAt"
    FROM "OccupancyLifecycleRequest" r WHERE r."societyId"=${societyId}::uuid ORDER BY r."createdAt" DESC LIMIT 250
  `);}

  async get(societyId:string,id:string){const rows=await this.prisma.$queryRaw<LifecycleRow[]>(Prisma.sql`
    SELECT * FROM "OccupancyLifecycleRequest" WHERE "societyId"=${societyId}::uuid AND "id"=${id}::uuid LIMIT 1
  `);if(!rows.length)throw new NotFoundException('Occupancy lifecycle request not found');const events=await this.prisma.$queryRaw(Prisma.sql`
    SELECT "id","eventType","actorUserId","note","createdAt" FROM "OccupancyLifecycleEvent" WHERE "societyId"=${societyId}::uuid AND "requestId"=${id}::uuid ORDER BY "createdAt"
  `);return {...rows[0],events};}

  async requestMoveIn(societyId:string,actorUserId:string,input:CreateMoveIn){if(input.relation===UnitRelation.FAMILY_MEMBER)throw new BadRequestException('Family members use the household-member lifecycle');return this.prisma.$transaction(async tx=>{
    await this.assertUnitAndUser(tx,societyId,input.unitId,input.userId);
    const existing=await tx.unitOccupancy.findFirst({where:{societyId,unitId:input.unitId,userId:input.userId,active:true}});if(existing)throw new ConflictException('User already has an active occupancy for this unit');
    const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
      INSERT INTO "OccupancyLifecycleRequest" ("societyId","unitId","userId","kind","relation","effectiveAt","reason","requestedByUserId")
      VALUES (${societyId}::uuid,${input.unitId}::uuid,${input.userId}::uuid,'MOVE_IN',${input.relation}::"UnitRelation",${input.effectiveAt},${input.reason?.trim()||null},${actorUserId}::uuid) RETURNING "id"
    `);await this.event(tx,societyId,rows[0].id,'REQUESTED',actorUserId,input.reason);return this.getTx(tx,societyId,rows[0].id);
  }).catch(e=>this.rethrow(e));}

  async requestMoveOut(societyId:string,actorUserId:string,input:CreateMoveOut){return this.prisma.$transaction(async tx=>{
    const occupancy=await tx.unitOccupancy.findFirst({where:{id:input.occupancyId,societyId,active:true}});if(!occupancy)throw new NotFoundException('Active occupancy not found');
    const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
      INSERT INTO "OccupancyLifecycleRequest" ("societyId","unitId","userId","occupancyId","kind","relation","effectiveAt","reason","requestedByUserId")
      VALUES (${societyId}::uuid,${occupancy.unitId}::uuid,${occupancy.userId}::uuid,${occupancy.id}::uuid,'MOVE_OUT',${occupancy.relation}::"UnitRelation",${input.effectiveAt},${input.reason?.trim()||null},${actorUserId}::uuid) RETURNING "id"
    `);await this.event(tx,societyId,rows[0].id,'REQUESTED',actorUserId,input.reason);return this.getTx(tx,societyId,rows[0].id);
  }).catch(e=>this.rethrow(e));}

  async review(societyId:string,actorUserId:string,id:string,approve:boolean,note?:string){return this.prisma.$transaction(async tx=>{
    const row=await this.lock(tx,societyId,id);if(row.status!=='REQUESTED')throw new ConflictException('Only requested lifecycle changes can be reviewed');const status:Status=approve?'APPROVED':'REJECTED';
    await tx.$executeRaw(Prisma.sql`UPDATE "OccupancyLifecycleRequest" SET "status"=${status},"reviewedByUserId"=${actorUserId}::uuid,"reviewedAt"=CURRENT_TIMESTAMP,"reason"=COALESCE(${note?.trim()||null},"reason"),"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid`);
    await this.event(tx,societyId,id,status,actorUserId,note);return this.getTx(tx,societyId,id);
  });}

  async complete(societyId:string,actorUserId:string,id:string){return this.prisma.$transaction(async tx=>{
    const row=await this.lock(tx,societyId,id);if(row.status!=='APPROVED')throw new ConflictException('Only approved lifecycle changes can be completed');
    if(row.effectiveAt.getTime()>Date.now())throw new ConflictException('Lifecycle change cannot be completed before its effective time');
    if(row.kind==='MOVE_IN'){
      const existing=await tx.unitOccupancy.findFirst({where:{societyId,unitId:row.unitId,userId:row.userId,active:true}});if(existing)throw new ConflictException('User already has an active occupancy for this unit');
      const occupancy=await tx.unitOccupancy.create({data:{societyId,unitId:row.unitId,userId:row.userId,relation:row.relation,effectiveFrom:row.effectiveAt,active:true,primaryGateContact:true,gateApprovalEnabled:true,gateNotificationEnabled:true}});
      await tx.$executeRaw(Prisma.sql`UPDATE "OccupancyLifecycleRequest" SET "occupancyId"=${occupancy.id}::uuid WHERE "id"=${id}::uuid`);
    }else{
      if(!row.occupancyId)throw new ConflictException('Move-out request has no occupancy');
      const occupancy=await tx.unitOccupancy.findFirst({where:{id:row.occupancyId,societyId,active:true}});if(!occupancy)throw new ConflictException('Occupancy is already inactive');
      await tx.unitOccupancy.update({where:{id:occupancy.id},data:{active:false,effectiveTo:row.effectiveAt,primaryGateContact:false,gateApprovalEnabled:false,gateNotificationEnabled:false}});
    }
    await tx.$executeRaw(Prisma.sql`UPDATE "OccupancyLifecycleRequest" SET "status"='COMPLETED',"completedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid`);
    await this.event(tx,societyId,id,'COMPLETED',actorUserId);return this.getTx(tx,societyId,id);
  });}

  private async assertUnitAndUser(tx:Prisma.TransactionClient,societyId:string,unitId:string,userId:string){const [unit,user]=await Promise.all([tx.unit.findFirst({where:{id:unitId,societyId},select:{id:true}}),tx.user.findUnique({where:{id:userId},select:{id:true}})]);if(!unit)throw new NotFoundException('Unit not found in society');if(!user)throw new NotFoundException('User not found');}
  private async lock(tx:Prisma.TransactionClient,societyId:string,id:string){const rows=await tx.$queryRaw<LifecycleRow[]>(Prisma.sql`SELECT * FROM "OccupancyLifecycleRequest" WHERE "societyId"=${societyId}::uuid AND "id"=${id}::uuid FOR UPDATE`);if(!rows.length)throw new NotFoundException('Occupancy lifecycle request not found');return rows[0];}
  private event(tx:Prisma.TransactionClient,societyId:string,requestId:string,eventType:string,actorUserId:string,note?:string){return tx.$executeRaw(Prisma.sql`INSERT INTO "OccupancyLifecycleEvent" ("societyId","requestId","eventType","actorUserId","note") VALUES (${societyId}::uuid,${requestId}::uuid,${eventType},${actorUserId}::uuid,${note?.trim()||null})`);}
  private async getTx(tx:Prisma.TransactionClient,societyId:string,id:string){const rows=await tx.$queryRaw<LifecycleRow[]>(Prisma.sql`SELECT * FROM "OccupancyLifecycleRequest" WHERE "societyId"=${societyId}::uuid AND "id"=${id}::uuid`);return rows[0];}
  private rethrow(error:unknown):never{if(error instanceof BadRequestException||error instanceof ConflictException||error instanceof NotFoundException)throw error;const message=error instanceof Error?error.message:'';if(message.includes('unique')||message.includes('duplicate key'))throw new ConflictException('An active lifecycle request already exists');throw error;}
}
