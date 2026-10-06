import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CommunityCirclesService {
  constructor(private readonly prisma: PrismaService) {}

  async listVisible(societyId:string,userId:string){
    await this.assertCurrentResident(societyId,userId);
    return this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      SELECT c."id",c."name",c."description",c."status",c."createdAt",
        EXISTS(
          SELECT 1 FROM "CommunityCircleMember" m
          WHERE m."societyId"=c."societyId" AND m."circleId"=c."id" AND m."userId"=${userId}::uuid
        ) AS "joined",
        (SELECT COUNT(*)::int FROM "CommunityCirclePost" p WHERE p."societyId"=c."societyId" AND p."circleId"=c."id") AS "postCount",
        (SELECT COUNT(*)::int FROM "CommunityCircleMember" m WHERE m."societyId"=c."societyId" AND m."circleId"=c."id") AS "memberCount"
      FROM "CommunityCircle" c
      WHERE c."societyId"=${societyId}::uuid AND c."status" IN ('ACTIVE','CLOSED')
      ORDER BY CASE WHEN c."status"='ACTIVE' THEN 0 ELSE 1 END,c."name"
      LIMIT 100
    `);
  }

  listManage(societyId:string){
    return this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      SELECT c."id",c."name",c."description",c."status",c."createdAt",c."updatedAt",
        COUNT(DISTINCT m."id")::int AS "memberCount",
        COUNT(DISTINCT p."id")::int AS "postCount"
      FROM "CommunityCircle" c
      LEFT JOIN "CommunityCircleMember" m ON m."societyId"=c."societyId" AND m."circleId"=c."id"
      LEFT JOIN "CommunityCirclePost" p ON p."societyId"=c."societyId" AND p."circleId"=c."id"
      WHERE c."societyId"=${societyId}::uuid
      GROUP BY c."id"
      ORDER BY c."createdAt" DESC
      LIMIT 250
    `);
  }

  async create(societyId:string,actorUserId:string,nameInput:string,descriptionInput?:string){
    const name=nameInput.trim();
    const description=descriptionInput?.trim()||null;
    if(name.length<3||name.length>80)throw new BadRequestException('Circle name must be between 3 and 80 characters');
    if(description&&description.length>500)throw new BadRequestException('Circle description is too long');
    const duplicate=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`
      SELECT "id" FROM "CommunityCircle"
      WHERE "societyId"=${societyId}::uuid AND LOWER(TRIM("name"))=LOWER(${name}) AND "status"<>'CLOSED'
      LIMIT 1
    `);
    if(duplicate[0])throw new ConflictException('An active community circle with this name already exists');
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      INSERT INTO "CommunityCircle" ("societyId","name","description","createdByUserId")
      VALUES (${societyId}::uuid,${name},${description},${actorUserId}::uuid)
      RETURNING *
    `);
    return rows[0];
  }

  async setStatus(societyId:string,circleId:string,status:'ACTIVE'|'CLOSED'){
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      UPDATE "CommunityCircle"
      SET "status"=${status},"updatedAt"=CURRENT_TIMESTAMP
      WHERE "societyId"=${societyId}::uuid AND "id"=${circleId}::uuid
      RETURNING *
    `);
    if(!rows[0])throw new NotFoundException('Community circle not found');
    return rows[0];
  }

  async join(societyId:string,userId:string,circleId:string){
    await this.assertCurrentResident(societyId,userId);
    const circle=await this.circle(societyId,circleId);
    if(circle.status!=='ACTIVE')throw new ConflictException('Closed community circle cannot accept new members');
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "CommunityCircleMember" ("societyId","circleId","userId")
      VALUES (${societyId}::uuid,${circleId}::uuid,${userId}::uuid)
      ON CONFLICT ("societyId","circleId","userId") DO NOTHING
    `);
    return {circleId,joined:true};
  }

  async leave(societyId:string,userId:string,circleId:string){
    await this.assertCurrentResident(societyId,userId);
    await this.prisma.$executeRaw(Prisma.sql`
      DELETE FROM "CommunityCircleMember"
      WHERE "societyId"=${societyId}::uuid AND "circleId"=${circleId}::uuid AND "userId"=${userId}::uuid
    `);
    return {circleId,joined:false};
  }

  async listPosts(societyId:string,userId:string,circleId:string){
    await this.assertMembership(societyId,userId,circleId);
    return this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      SELECT p."id",p."body",p."createdAt",(p."authorUserId"=${userId}::uuid) AS "mine"
      FROM "CommunityCirclePost" p
      WHERE p."societyId"=${societyId}::uuid AND p."circleId"=${circleId}::uuid
      ORDER BY p."createdAt" DESC
      LIMIT 100
    `);
  }

  async createPost(societyId:string,userId:string,circleId:string,bodyInput:string){
    const body=bodyInput.trim();
    if(body.length<1||body.length>1000)throw new BadRequestException('Circle post must be between 1 and 1000 characters');
    await this.assertMembership(societyId,userId,circleId);
    const circle=await this.circle(societyId,circleId);
    if(circle.status!=='ACTIVE')throw new ConflictException('Closed community circle is read-only');
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      INSERT INTO "CommunityCirclePost" ("societyId","circleId","authorUserId","body")
      VALUES (${societyId}::uuid,${circleId}::uuid,${userId}::uuid,${body})
      RETURNING "id","body","createdAt",TRUE AS "mine"
    `);
    return rows[0];
  }

  private async circle(societyId:string,circleId:string){
    const rows=await this.prisma.$queryRaw<Array<{id:string;status:string}>>(Prisma.sql`
      SELECT "id","status" FROM "CommunityCircle"
      WHERE "societyId"=${societyId}::uuid AND "id"=${circleId}::uuid
      LIMIT 1
    `);
    if(!rows[0])throw new NotFoundException('Community circle not found');
    return rows[0];
  }

  private async assertMembership(societyId:string,userId:string,circleId:string){
    await this.assertCurrentResident(societyId,userId);
    const rows=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`
      SELECT "id" FROM "CommunityCircleMember"
      WHERE "societyId"=${societyId}::uuid AND "circleId"=${circleId}::uuid AND "userId"=${userId}::uuid
      LIMIT 1
    `);
    if(!rows[0])throw new ForbiddenException('Join this community circle before viewing or posting messages');
  }

  private async assertCurrentResident(societyId:string,userId:string){
    const rows=await this.prisma.$queryRaw<Array<{allowed:boolean}>>(Prisma.sql`
      SELECT (
        EXISTS(
          SELECT 1 FROM "UnitOwnership" ow
          WHERE ow."societyId"=${societyId}::uuid AND ow."userId"=${userId}::uuid
            AND ow."verified"=TRUE AND ow."active"=TRUE AND ow."effectiveFrom"<=CURRENT_TIMESTAMP
            AND (ow."effectiveTo" IS NULL OR ow."effectiveTo">CURRENT_TIMESTAMP)
        )
        OR EXISTS(
          SELECT 1 FROM "UnitOccupancy" oc
          WHERE oc."societyId"=${societyId}::uuid AND oc."userId"=${userId}::uuid
            AND oc."active"=TRUE AND oc."effectiveFrom"<=CURRENT_TIMESTAMP
            AND (oc."effectiveTo" IS NULL OR oc."effectiveTo">CURRENT_TIMESTAMP)
        )
      ) AS "allowed"
    `);
    if(rows[0]?.allowed!==true)throw new ForbiddenException('Community circles are available only to current society residents or verified owners');
  }
}
