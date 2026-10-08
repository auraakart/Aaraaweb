import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = Prisma.TransactionClient;
type Circle = {id:string;status:string;expiresAt:Date|null};
export function circleExpiry(input?:string|null):Date|null {
  if(input==null)return null;
  const at=new Date(input);
  if(!Number.isFinite(at.getTime())||at.getTime()<=Date.now())throw new BadRequestException('Deletion date must be a valid future date');
  return at;
}

@Injectable()
export class CommunityCirclesService {
  constructor(private readonly prisma:PrismaService){}

  async listVisible(societyId:string,userId:string){
    await this.assertCurrentResident(societyId,userId);
    return this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      SELECT c."id",c."name",c."description",c."status",c."createdAt",c."expiresAt",
        EXISTS(SELECT 1 FROM "CommunityCircleMember" m WHERE m."societyId"=c."societyId" AND m."circleId"=c."id" AND m."userId"=${userId}::uuid) AS "joined",
        (SELECT COUNT(*)::int FROM "CommunityCirclePost" p WHERE p."societyId"=c."societyId" AND p."circleId"=c."id" AND p."hidden"=false) AS "postCount",
        (SELECT COUNT(*)::int FROM "CommunityCircleMember" m WHERE m."societyId"=c."societyId" AND m."circleId"=c."id") AS "memberCount"
      FROM "CommunityCircle" c WHERE c."societyId"=${societyId}::uuid AND c."status" IN ('ACTIVE','CLOSED')
        AND (c."expiresAt" IS NULL OR c."expiresAt">CURRENT_TIMESTAMP)
      ORDER BY CASE WHEN c."status"='ACTIVE' THEN 0 ELSE 1 END,c."name" LIMIT 100
    `);
  }
  listManage(societyId:string){
    return this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      SELECT c.*,COALESCE(NULLIF(TRIM(u."name"),''),'Member') AS "requestedByName",
        COUNT(DISTINCT m."id")::int AS "memberCount",COUNT(DISTINCT p."id")::int AS "postCount"
      FROM "CommunityCircle" c JOIN "User" u ON u."id"=c."createdByUserId"
      LEFT JOIN "CommunityCircleMember" m ON m."societyId"=c."societyId" AND m."circleId"=c."id"
      LEFT JOIN "CommunityCirclePost" p ON p."societyId"=c."societyId" AND p."circleId"=c."id"
      WHERE c."societyId"=${societyId}::uuid AND (c."expiresAt" IS NULL OR c."expiresAt">CURRENT_TIMESTAMP)
      GROUP BY c."id",u."name" ORDER BY CASE WHEN c."status"='PENDING' THEN 0 ELSE 1 END,c."createdAt" DESC LIMIT 250
    `);
  }
  async myRequests(societyId:string,userId:string){
    await this.assertCurrentResident(societyId,userId);
    return this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      SELECT "id","name","description","status","reviewNote","createdAt","expiresAt" FROM "CommunityCircle"
      WHERE "societyId"=${societyId}::uuid AND "createdByUserId"=${userId}::uuid
        AND ("expiresAt" IS NULL OR "expiresAt">CURRENT_TIMESTAMP) ORDER BY "createdAt" DESC LIMIT 100
    `);
  }
  async request(societyId:string,userId:string,name:string,description?:string){
    await this.assertCurrentResident(societyId,userId);
    return this.insertCircle(societyId,userId,name,description,'PENDING',null);
  }
  create(societyId:string,actor:string,name:string,description?:string,expiresAt?:string|null){
    return this.insertCircle(societyId,actor,name,description,'ACTIVE',circleExpiry(expiresAt));
  }
  private async insertCircle(societyId:string,actor:string,nameInput:string,descriptionInput:string|undefined,status:string,expiresAt:Date|null){
    const name=nameInput.trim(),description=descriptionInput?.trim()||null;
    if(name.length<3||name.length>80)throw new BadRequestException('Circle name must be between 3 and 80 characters');
    if(description&&description.length>500)throw new BadRequestException('Circle description is too long');
    return this.prisma.$transaction(async tx=>{
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${societyId}),hashtext(${name.toLowerCase()}))::text`);
      const duplicate=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
        SELECT "id" FROM "CommunityCircle" WHERE "societyId"=${societyId}::uuid AND LOWER(TRIM("name"))=LOWER(${name})
          AND "status" IN ('ACTIVE','PENDING') AND ("expiresAt" IS NULL OR "expiresAt">CURRENT_TIMESTAMP) LIMIT 1
      `);
      if(duplicate[0])throw new ConflictException('An active or pending community circle with this name already exists');
      const rows=await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        INSERT INTO "CommunityCircle" ("societyId","name","description","createdByUserId","status","expiresAt")
        VALUES (${societyId}::uuid,${name},${description},${actor}::uuid,${status},${expiresAt}) RETURNING *
      `);return rows[0];
    });
  }
  async review(societyId:string,id:string,actor:string,decision:'APPROVE'|'REJECT',note:string){
    const reason=this.reason(note);
    return this.prisma.$transaction(async tx=>{
      const circle=await this.circle(societyId,id,tx,true);
      if(circle.status!=='PENDING')throw new ConflictException('Only pending circle requests can be reviewed');
      const rows=await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        UPDATE "CommunityCircle" SET "status"=${decision==='APPROVE'?'ACTIVE':'REJECTED'},"reviewedByUserId"=${actor}::uuid,
          "reviewedAt"=CURRENT_TIMESTAMP,"reviewNote"=${reason},"updatedAt"=CURRENT_TIMESTAMP
        WHERE "societyId"=${societyId}::uuid AND "id"=${id}::uuid RETURNING *
      `);return rows[0];
    });
  }
  async setStatus(societyId:string,id:string,status:'ACTIVE'|'CLOSED'){
    return this.prisma.$transaction(async tx=>{
      const circle=await this.circle(societyId,id,tx,true);
      if(!['ACTIVE','CLOSED'].includes(circle.status))throw new ConflictException('Review a circle request before changing its lifecycle');
      const rows=await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`UPDATE "CommunityCircle"
        SET "status"=${status},"updatedAt"=CURRENT_TIMESTAMP WHERE "societyId"=${societyId}::uuid AND "id"=${id}::uuid RETURNING *`);
      return rows[0];
    });
  }
  async setExpiry(societyId:string,id:string,input:string|null){
    const expiresAt=circleExpiry(input);
    return this.prisma.$transaction(async tx=>{
      await this.circle(societyId,id,tx,true);
      const rows=await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`UPDATE "CommunityCircle"
        SET "expiresAt"=${expiresAt},"updatedAt"=CURRENT_TIMESTAMP WHERE "societyId"=${societyId}::uuid AND "id"=${id}::uuid RETURNING *`);
      return rows[0];
    });
  }
  async join(societyId:string,userId:string,id:string){
    await this.assertCurrentResident(societyId,userId);
    return this.prisma.$transaction(async tx=>{
      const circle=await this.circle(societyId,id,tx,true);
      if(circle.status!=='ACTIVE')throw new ConflictException('Closed community circle cannot accept new members');
      await tx.$executeRaw(Prisma.sql`INSERT INTO "CommunityCircleMember" ("societyId","circleId","userId")
        VALUES (${societyId}::uuid,${id}::uuid,${userId}::uuid) ON CONFLICT ("societyId","circleId","userId") DO NOTHING`);
      return {circleId:id,joined:true};
    });
  }
  async leave(societyId:string,userId:string,id:string){
    await this.assertCurrentResident(societyId,userId);
    await this.prisma.$executeRaw(Prisma.sql`DELETE FROM "CommunityCircleMember"
      WHERE "societyId"=${societyId}::uuid AND "circleId"=${id}::uuid AND "userId"=${userId}::uuid`);
    return {circleId:id,joined:false};
  }
  async listPosts(societyId:string,userId:string,id:string){
    await this.assertMembership(societyId,userId,id);
    return this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      SELECT recent."id",recent."body",recent."createdAt",recent."mine",recent."senderName",recent."senderFlat" FROM (
        SELECT p."id",p."body",p."createdAt",p."senderName",p."senderFlat",(p."authorUserId"=${userId}::uuid) AS "mine"
        FROM "CommunityCirclePost" p JOIN "CommunityCircle" c ON c."id"=p."circleId" AND c."societyId"=p."societyId"
        WHERE p."societyId"=${societyId}::uuid AND p."circleId"=${id}::uuid AND p."hidden"=false
          AND c."status" IN ('ACTIVE','CLOSED') AND (c."expiresAt" IS NULL OR c."expiresAt">CURRENT_TIMESTAMP)
        ORDER BY p."createdAt" DESC,p."id" DESC LIMIT 100
      ) recent ORDER BY recent."createdAt" ASC,recent."id" ASC
    `);
  }
  async createPost(societyId:string,userId:string,id:string,bodyInput:string){
    const body=bodyInput.trim();
    if(body.length<1||body.length>1000)throw new BadRequestException('Circle post must be between 1 and 1000 characters');
    return this.prisma.$transaction(async tx=>{
      const circle=await this.circle(societyId,id,tx,true);
      if(circle.status!=='ACTIVE')throw new ConflictException('Closed community circle is read-only');
      await this.assertMembership(societyId,userId,id,tx);
      const identity=await this.senderIdentity(tx,societyId,userId);
      const rows=await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        INSERT INTO "CommunityCirclePost" ("societyId","circleId","authorUserId","body","senderName","senderFlat")
        VALUES (${societyId}::uuid,${id}::uuid,${userId}::uuid,${body},${identity.senderName},${identity.senderFlat})
        RETURNING "id","body","createdAt","senderName","senderFlat",TRUE AS "mine"
      `);return rows[0];
    });
  }
  async report(societyId:string,userId:string,id:string,postId:string,note:string){
    const reason=this.reason(note);
    return this.prisma.$transaction(async tx=>{
      await this.circle(societyId,id,tx,true);await this.assertMembership(societyId,userId,id,tx);
      const rows=await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        INSERT INTO "CommunityCircleReport" ("societyId","circleId","postId","reporterUserId","reason")
        SELECT ${societyId}::uuid,${id}::uuid,p."id",${userId}::uuid,${reason} FROM "CommunityCirclePost" p
        WHERE p."societyId"=${societyId}::uuid AND p."circleId"=${id}::uuid AND p."id"=${postId}::uuid AND p."hidden"=false
        ON CONFLICT ("societyId","postId","reporterUserId") DO UPDATE SET "reason"=EXCLUDED."reason", "status"='OPEN',"resolvedAt"=NULL,"resolvedByUserId"=NULL
        RETURNING "id","status"
      `);
      if(!rows[0])throw new NotFoundException('Circle message not found');return rows[0];
    });
  }
  listReports(societyId:string){
    return this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      SELECT r."id",r."circleId",r."postId",r."reason",r."status",r."createdAt",p."body",p."senderName",p."senderFlat",p."hidden",c."name" AS "circleName"
      FROM "CommunityCircleReport" r JOIN "CommunityCirclePost" p ON p."id"=r."postId" AND p."societyId"=r."societyId"
      JOIN "CommunityCircle" c ON c."id"=r."circleId" AND c."societyId"=r."societyId"
      WHERE r."societyId"=${societyId}::uuid AND (c."expiresAt" IS NULL OR c."expiresAt">CURRENT_TIMESTAMP)
      ORDER BY CASE WHEN r."status"='OPEN' THEN 0 ELSE 1 END,r."createdAt" DESC LIMIT 250
    `);
  }
  async moderate(societyId:string,id:string,postId:string,actor:string,hidden:boolean,note:string){
    const reason=this.reason(note);
    return this.prisma.$transaction(async tx=>{
      await this.circle(societyId,id,tx,true);
      const rows=await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`UPDATE "CommunityCirclePost"
        SET "hidden"=${hidden},"moderatedByUserId"=${actor}::uuid,"moderatedAt"=CURRENT_TIMESTAMP,"moderationReason"=${reason}
        WHERE "societyId"=${societyId}::uuid AND "circleId"=${id}::uuid AND "id"=${postId}::uuid RETURNING "id","hidden"`);
      if(!rows[0])throw new NotFoundException('Circle message not found');
      await tx.$executeRaw(Prisma.sql`UPDATE "CommunityCircleReport" SET "status"='RESOLVED',"resolvedAt"=CURRENT_TIMESTAMP,"resolvedByUserId"=${actor}::uuid
        WHERE "societyId"=${societyId}::uuid AND "circleId"=${id}::uuid AND "postId"=${postId}::uuid AND "status"='OPEN'`);
      return rows[0];
    });
  }
  async deleteExpired(){
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
        WITH due AS (SELECT "id" FROM "CommunityCircle" WHERE "expiresAt" IS NOT NULL AND "expiresAt"<=CURRENT_TIMESTAMP
          ORDER BY "expiresAt" LIMIT 100 FOR UPDATE SKIP LOCKED)
        DELETE FROM "CommunityCircle" c USING due WHERE c."id"=due."id" RETURNING c."id"
      `);return {deleted:rows.length};
    });
  }
  private reason(input:string){const reason=input.trim();if(reason.length<3||reason.length>500)throw new BadRequestException('Reason must be between 3 and 500 characters');return reason;}
  private async circle(societyId:string,id:string,db:Db=this.prisma,lock=false){
    const rows=await db.$queryRaw<Circle[]>(Prisma.sql`SELECT "id","status","expiresAt" FROM "CommunityCircle"
      WHERE "societyId"=${societyId}::uuid AND "id"=${id}::uuid AND ("expiresAt" IS NULL OR "expiresAt">CURRENT_TIMESTAMP)
      LIMIT 1 ${lock?Prisma.sql`FOR UPDATE`:Prisma.empty}`);
    if(!rows[0])throw new NotFoundException('Community circle not found or expired');return rows[0];
  }
  private async assertMembership(societyId:string,userId:string,id:string,db:Db=this.prisma){
    await this.assertCurrentResident(societyId,userId,db);
    const rows=await db.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT m."id" FROM "CommunityCircleMember" m
      JOIN "CommunityCircle" c ON c."id"=m."circleId" AND c."societyId"=m."societyId"
      WHERE m."societyId"=${societyId}::uuid AND m."circleId"=${id}::uuid AND m."userId"=${userId}::uuid
        AND c."status" IN ('ACTIVE','CLOSED') AND (c."expiresAt" IS NULL OR c."expiresAt">CURRENT_TIMESTAMP) LIMIT 1`);
    if(!rows[0])throw new ForbiddenException('Join this community circle before viewing or posting messages');
  }
  private async senderIdentity(db:Db,societyId:string,userId:string){
    const rows=await db.$queryRaw<Array<{senderName:string;senderFlat:string}>>(Prisma.sql`
      SELECT TRIM(u."name") AS "senderName",CONCAT(b."name",' · ',un."number") AS "senderFlat" FROM "User" u JOIN LATERAL (
        SELECT "unitId","effectiveFrom",0 AS priority FROM "UnitOccupancy"
        WHERE "societyId"=${societyId}::uuid AND "userId"=${userId}::uuid AND "active"=true
          AND "effectiveFrom"<=CURRENT_TIMESTAMP AND ("effectiveTo" IS NULL OR "effectiveTo">CURRENT_TIMESTAMP)
        UNION ALL SELECT "unitId","effectiveFrom",1 AS priority FROM "UnitOwnership"
        WHERE "societyId"=${societyId}::uuid AND "userId"=${userId}::uuid AND "active"=true AND "verified"=true
          AND "effectiveFrom"<=CURRENT_TIMESTAMP AND ("effectiveTo" IS NULL OR "effectiveTo">CURRENT_TIMESTAMP)
      ) relation ON true JOIN "Unit" un ON un."id"=relation."unitId" AND un."societyId"=${societyId}::uuid
      JOIN "Building" b ON b."id"=un."buildingId"
      WHERE u."id"=${userId}::uuid AND NULLIF(TRIM(u."name"),'') IS NOT NULL
      ORDER BY relation.priority,relation."effectiveFrom" DESC,un."id" LIMIT 1
    `);
    if(!rows[0])throw new BadRequestException('A profile name and verified society flat are required before posting');return rows[0];
  }
  private async assertCurrentResident(societyId:string,userId:string,db:Db=this.prisma){
    const rows=await db.$queryRaw<Array<{allowed:boolean}>>(Prisma.sql`SELECT (
      EXISTS(SELECT 1 FROM "UnitOwnership" ow WHERE ow."societyId"=${societyId}::uuid AND ow."userId"=${userId}::uuid AND ow."verified"=TRUE AND ow."active"=TRUE
        AND ow."effectiveFrom"<=CURRENT_TIMESTAMP AND (ow."effectiveTo" IS NULL OR ow."effectiveTo">CURRENT_TIMESTAMP))
      OR EXISTS(SELECT 1 FROM "UnitOccupancy" oc WHERE oc."societyId"=${societyId}::uuid AND oc."userId"=${userId}::uuid AND oc."active"=TRUE
        AND oc."effectiveFrom"<=CURRENT_TIMESTAMP AND (oc."effectiveTo" IS NULL OR oc."effectiveTo">CURRENT_TIMESTAMP))) AS "allowed"`);
    if(rows[0]?.allowed!==true)throw new ForbiddenException('Community circles are available only to current society residents or verified owners');
  }
}
