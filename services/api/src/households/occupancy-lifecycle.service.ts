import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UnitRelation } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Kind='MOVE_IN'|'MOVE_OUT';
type Status='REQUESTED'|'APPROVED'|'REJECTED'|'COMPLETED'|'CANCELLED';
type CreateMoveIn={unitId:string;userId:string;relation:UnitRelation;effectiveAt:Date;reason?:string};
type CreateMoveOut={occupancyId:string;effectiveAt:Date;reason?:string};
type LifecycleRow={id:string;societyId:string;unitId:string;userId:string;occupancyId:string|null;kind:Kind;relation:UnitRelation;status:Status;effectiveAt:Date;reason:string|null;reviewedByUserId?:string|null};

@Injectable()
export class OccupancyLifecycleService{
  constructor(private readonly prisma:PrismaService){}

  list(societyId:string){return this.prisma.$queryRaw(Prisma.sql`
    SELECT r."id",r."unitId",r."userId",r."occupancyId",r."kind",r."relation",r."status",r."effectiveAt",r."reason",
           r."requestedByUserId",r."reviewedByUserId",r."reviewedAt",r."completedAt",r."createdAt",r."updatedAt"
    FROM "OccupancyLifecycleRequest" r WHERE r."societyId"=${societyId}::uuid ORDER BY r."createdAt" DESC LIMIT 250
  `);}

  listMine(societyId:string,userId:string){return this.prisma.$queryRaw(Prisma.sql`
    SELECT r."id",r."unitId",r."userId",r."occupancyId",r."kind",r."relation",r."status",r."effectiveAt",r."reason",
           r."requestedByUserId",r."reviewedAt",r."completedAt",r."createdAt",r."updatedAt"
    FROM "OccupancyLifecycleRequest" r
    WHERE r."societyId"=${societyId}::uuid AND (r."requestedByUserId"=${userId}::uuid OR r."userId"=${userId}::uuid)
    ORDER BY r."createdAt" DESC LIMIT 100
  `);}

  async selfContext(societyId:string,userId:string){const now=new Date();const [occupancies,ownerships]=await Promise.all([
    this.prisma.unitOccupancy.findMany({where:{societyId,userId,active:true,effectiveFrom:{lte:now},OR:[{effectiveTo:null},{effectiveTo:{gt:now}}]},select:{id:true,unitId:true,relation:true,effectiveFrom:true},orderBy:{createdAt:'asc'}}),
    this.prisma.unitOwnership.findMany({where:{societyId,userId,active:true,verified:true,effectiveFrom:{lte:now},OR:[{effectiveTo:null},{effectiveTo:{gt:now}}]},select:{unitId:true,ownershipBps:true},orderBy:{createdAt:'asc'}})
  ]);return {occupancies,ownedUnitIds:ownerships.map(item=>item.unitId)};}

  async get(societyId:string,id:string){const rows=await this.prisma.$queryRaw<LifecycleRow[]>(Prisma.sql`
    SELECT * FROM "OccupancyLifecycleRequest" WHERE "societyId"=${societyId}::uuid AND "id"=${id}::uuid LIMIT 1
  `);if(!rows.length)throw new NotFoundException('Occupancy lifecycle request not found');const [events,checklist,documents]=await Promise.all([
    this.prisma.$queryRaw(Prisma.sql`SELECT "id","eventType","actorUserId","note","createdAt" FROM "OccupancyLifecycleEvent" WHERE "societyId"=${societyId}::uuid AND "requestId"=${id}::uuid ORDER BY "createdAt"`),
    this.prisma.$queryRaw(Prisma.sql`SELECT "id","code","label","required","completedAt","completedByUserId","note","createdAt","updatedAt" FROM "OccupancyLifecycleChecklistItem" WHERE "societyId"=${societyId}::uuid AND "requestId"=${id}::uuid ORDER BY "createdAt"`),
    this.prisma.$queryRaw(Prisma.sql`SELECT "id","kind","fileReference","uploadedByUserId","verifiedAt","verifiedByUserId","note","createdAt" FROM "OccupancyLifecycleDocument" WHERE "societyId"=${societyId}::uuid AND "requestId"=${id}::uuid ORDER BY "createdAt"`)
  ]);return {...rows[0],events,checklist,documents};}

  async getMine(societyId:string,userId:string,id:string){const rows=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`
    SELECT "id" FROM "OccupancyLifecycleRequest" WHERE "societyId"=${societyId}::uuid AND "id"=${id}::uuid AND ("requestedByUserId"=${userId}::uuid OR "userId"=${userId}::uuid) LIMIT 1
  `);if(!rows.length)throw new NotFoundException('Occupancy lifecycle request not found');return this.get(societyId,id);}

  async requestMoveIn(societyId:string,actorUserId:string,input:CreateMoveIn){if(input.relation===UnitRelation.FAMILY_MEMBER)throw new BadRequestException('Family members use the household-member lifecycle');return this.prisma.$transaction(async tx=>{
    await this.assertUnitAndUser(tx,societyId,input.unitId,input.userId);
    const existing=await tx.unitOccupancy.findFirst({where:{societyId,unitId:input.unitId,userId:input.userId,active:true}});if(existing)throw new ConflictException('User already has an active occupancy for this unit');
    const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`INSERT INTO "OccupancyLifecycleRequest" ("societyId","unitId","userId","kind","relation","effectiveAt","reason","requestedByUserId") VALUES (${societyId}::uuid,${input.unitId}::uuid,${input.userId}::uuid,'MOVE_IN',${input.relation}::"UnitRelation",${input.effectiveAt},${input.reason?.trim()||null},${actorUserId}::uuid) RETURNING "id"`);
    await this.seedChecklist(tx,societyId,rows[0].id,'MOVE_IN');await this.event(tx,societyId,rows[0].id,'REQUESTED',actorUserId,input.reason);return this.getTx(tx,societyId,rows[0].id);
  }).catch(e=>this.rethrow(e));}

  async requestMoveOut(societyId:string,actorUserId:string,input:CreateMoveOut){return this.prisma.$transaction(async tx=>{
    const occupancy=await tx.unitOccupancy.findFirst({where:{id:input.occupancyId,societyId,active:true}});if(!occupancy)throw new NotFoundException('Active occupancy not found');
    const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`INSERT INTO "OccupancyLifecycleRequest" ("societyId","unitId","userId","occupancyId","kind","relation","effectiveAt","reason","requestedByUserId") VALUES (${societyId}::uuid,${occupancy.unitId}::uuid,${occupancy.userId}::uuid,${occupancy.id}::uuid,'MOVE_OUT',${occupancy.relation}::"UnitRelation",${input.effectiveAt},${input.reason?.trim()||null},${actorUserId}::uuid) RETURNING "id"`);
    await this.seedChecklist(tx,societyId,rows[0].id,'MOVE_OUT');await this.event(tx,societyId,rows[0].id,'REQUESTED',actorUserId,input.reason);return this.getTx(tx,societyId,rows[0].id);
  }).catch(e=>this.rethrow(e));}

  async requestOwnerMoveIn(societyId:string,actorUserId:string,input:CreateMoveIn){const owner=await this.prisma.unitOwnership.findFirst({where:{societyId,unitId:input.unitId,userId:actorUserId,active:true,verified:true},select:{id:true}});if(!owner)throw new BadRequestException('Verified active ownership is required to initiate move-in');const relation=actorUserId===input.userId?UnitRelation.OWNER:UnitRelation.TENANT;return this.requestMoveIn(societyId,actorUserId,{...input,relation});}

  async requestMyMoveOut(societyId:string,actorUserId:string,input:CreateMoveOut){const occupancy=await this.prisma.unitOccupancy.findFirst({where:{id:input.occupancyId,societyId,userId:actorUserId,active:true},select:{id:true}});if(!occupancy)throw new NotFoundException('Your active occupancy was not found');return this.requestMoveOut(societyId,actorUserId,input);}

  async review(societyId:string,actorUserId:string,id:string,approve:boolean,note?:string){return this.prisma.$transaction(async tx=>{const row=await this.lock(tx,societyId,id);if(row.status!=='REQUESTED')throw new ConflictException('Only requested lifecycle changes can be reviewed');const status:Status=approve?'APPROVED':'REJECTED';await tx.$executeRaw(Prisma.sql`UPDATE "OccupancyLifecycleRequest" SET "status"=${status},"reviewedByUserId"=${actorUserId}::uuid,"reviewedAt"=CURRENT_TIMESTAMP,"reason"=COALESCE(${note?.trim()||null},"reason"),"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid`);await this.event(tx,societyId,id,status,actorUserId,note);return this.getTx(tx,societyId,id);});}

  async setChecklistItem(societyId:string,actorUserId:string,id:string,itemId:string,completed:boolean,note?:string){return this.prisma.$transaction(async tx=>{await this.lock(tx,societyId,id);const count=await tx.$executeRaw(Prisma.sql`UPDATE "OccupancyLifecycleChecklistItem" SET "completedAt"=CASE WHEN ${completed} THEN CURRENT_TIMESTAMP ELSE NULL END,"completedByUserId"=CASE WHEN ${completed} THEN ${actorUserId}::uuid ELSE NULL END,"note"=${note?.trim()||null},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${itemId}::uuid AND "requestId"=${id}::uuid AND "societyId"=${societyId}::uuid`);if(count===0)throw new NotFoundException('Checklist item not found');await this.event(tx,societyId,id,completed?'CHECKLIST_COMPLETED':'CHECKLIST_REOPENED',actorUserId,note);return this.getTx(tx,societyId,id);});}

  async addDocument(societyId:string,actorUserId:string,id:string,kind:string,fileReference:string,note?:string){const k=kind.trim(),ref=fileReference.trim();if(!k||!ref)throw new BadRequestException('Document kind and file reference are required');return this.prisma.$transaction(async tx=>{await this.lock(tx,societyId,id);await tx.$executeRaw(Prisma.sql`INSERT INTO "OccupancyLifecycleDocument" ("societyId","requestId","kind","fileReference","uploadedByUserId","note") VALUES (${societyId}::uuid,${id}::uuid,${k},${ref},${actorUserId}::uuid,${note?.trim()||null})`);await this.event(tx,societyId,id,'DOCUMENT_ADDED',actorUserId,k);return this.getTx(tx,societyId,id);});}

  async verifyDocument(societyId:string,actorUserId:string,id:string,documentId:string,note?:string){return this.prisma.$transaction(async tx=>{await this.lock(tx,societyId,id);const count=await tx.$executeRaw(Prisma.sql`UPDATE "OccupancyLifecycleDocument" SET "verifiedAt"=CURRENT_TIMESTAMP,"verifiedByUserId"=${actorUserId}::uuid,"note"=COALESCE(${note?.trim()||null},"note") WHERE "id"=${documentId}::uuid AND "requestId"=${id}::uuid AND "societyId"=${societyId}::uuid`);if(count===0)throw new NotFoundException('Lifecycle document not found');await this.event(tx,societyId,id,'DOCUMENT_VERIFIED',actorUserId,note);return this.getTx(tx,societyId,id);});}

  async complete(societyId:string,actorUserId:string,id:string,automatic=false){return this.prisma.$transaction(async tx=>{
    const row=await this.lock(tx,societyId,id);if(row.status!=='APPROVED')throw new ConflictException('Only approved lifecycle changes can be completed');if(row.effectiveAt.getTime()>Date.now())throw new ConflictException('Lifecycle change cannot be completed before its effective time');await this.assertChecklistReady(tx,societyId,id);
    if(row.kind==='MOVE_IN'){const existing=await tx.unitOccupancy.findFirst({where:{societyId,unitId:row.unitId,userId:row.userId,active:true}});if(existing)throw new ConflictException('User already has an active occupancy for this unit');const occupancy=await tx.unitOccupancy.create({data:{societyId,unitId:row.unitId,userId:row.userId,relation:row.relation,effectiveFrom:row.effectiveAt,active:true,primaryGateContact:true,gateApprovalEnabled:true,gateNotificationEnabled:true}});await tx.$executeRaw(Prisma.sql`UPDATE "OccupancyLifecycleRequest" SET "occupancyId"=${occupancy.id}::uuid WHERE "id"=${id}::uuid`);}else{if(!row.occupancyId)throw new ConflictException('Move-out request has no occupancy');const occupancy=await tx.unitOccupancy.findFirst({where:{id:row.occupancyId,societyId,active:true}});if(!occupancy)throw new ConflictException('Occupancy is already inactive');await tx.unitOccupancy.update({where:{id:occupancy.id},data:{active:false,effectiveTo:row.effectiveAt,primaryGateContact:false,gateApprovalEnabled:false,gateNotificationEnabled:false}});}
    await tx.$executeRaw(Prisma.sql`UPDATE "OccupancyLifecycleRequest" SET "status"='COMPLETED',"completedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid`);await this.event(tx,societyId,id,automatic?'AUTO_COMPLETED':'COMPLETED',actorUserId);return this.getTx(tx,societyId,id);
  });}

  dueApproved(limit=50){return this.prisma.$queryRaw<Array<LifecycleRow>>(Prisma.sql`SELECT * FROM "OccupancyLifecycleRequest" WHERE "status"='APPROVED' AND "effectiveAt"<=CURRENT_TIMESTAMP ORDER BY "effectiveAt" ASC LIMIT ${limit}`);}

  private async assertChecklistReady(tx:Prisma.TransactionClient,societyId:string,id:string){const rows=await tx.$queryRaw<Array<{count:bigint}>>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "OccupancyLifecycleChecklistItem" WHERE "societyId"=${societyId}::uuid AND "requestId"=${id}::uuid AND "required"=true AND "completedAt" IS NULL`);if(rows[0]?.count>0n)throw new ConflictException('Required move checklist is incomplete');}
  private async seedChecklist(tx:Prisma.TransactionClient,societyId:string,id:string,kind:Kind){const items=kind==='MOVE_IN'?[['IDENTITY_VERIFIED','Identity / resident details verified'],['SOCIETY_DUES_CLEAR','Society dues / onboarding charges cleared'],['ACCESS_HANDOVER_READY','Gate and access handover ready']]:[['SOCIETY_DUES_CLEAR','Society dues cleared'],['ACCESS_REVOKE_READY','Gate/access revocation ready']];for(const [code,label] of items)await tx.$executeRaw(Prisma.sql`INSERT INTO "OccupancyLifecycleChecklistItem" ("societyId","requestId","code","label") VALUES (${societyId}::uuid,${id}::uuid,${code},${label})`);}
  private async assertUnitAndUser(tx:Prisma.TransactionClient,societyId:string,unitId:string,userId:string){const [unit,user]=await Promise.all([tx.unit.findFirst({where:{id:unitId,societyId},select:{id:true}}),tx.user.findUnique({where:{id:userId},select:{id:true}})]);if(!unit)throw new NotFoundException('Unit not found in society');if(!user)throw new NotFoundException('User not found');}
  private async lock(tx:Prisma.TransactionClient,societyId:string,id:string){const rows=await tx.$queryRaw<LifecycleRow[]>(Prisma.sql`SELECT * FROM "OccupancyLifecycleRequest" WHERE "societyId"=${societyId}::uuid AND "id"=${id}::uuid FOR UPDATE`);if(!rows.length)throw new NotFoundException('Occupancy lifecycle request not found');return rows[0];}
  private event(tx:Prisma.TransactionClient,societyId:string,requestId:string,eventType:string,actorUserId:string,note?:string){return tx.$executeRaw(Prisma.sql`INSERT INTO "OccupancyLifecycleEvent" ("societyId","requestId","eventType","actorUserId","note") VALUES (${societyId}::uuid,${requestId}::uuid,${eventType},${actorUserId}::uuid,${note?.trim()||null})`);}
  private async getTx(tx:Prisma.TransactionClient,societyId:string,id:string){const rows=await tx.$queryRaw<LifecycleRow[]>(Prisma.sql`SELECT * FROM "OccupancyLifecycleRequest" WHERE "societyId"=${societyId}::uuid AND "id"=${id}::uuid`);return rows[0];}
  private rethrow(error:unknown):never{if(error instanceof BadRequestException||error instanceof ConflictException||error instanceof NotFoundException)throw error;const message=error instanceof Error?error.message:'';if(message.includes('unique')||message.includes('duplicate key'))throw new ConflictException('An active lifecycle request already exists');throw error;}
}
