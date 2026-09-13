import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FacilitiesPreventiveService implements OnModuleInit,OnModuleDestroy{
  private readonly logger=new Logger(FacilitiesPreventiveService.name);
  private timer?:NodeJS.Timeout;
  constructor(private readonly prisma:PrismaService){}

  onModuleInit(){
    if(process.env.FACILITIES_PREVENTIVE_AUTO_GENERATE!=='true')return;
    const raw=Number(process.env.FACILITIES_PREVENTIVE_INTERVAL_MS??21600000);
    const interval=Math.max(Number.isFinite(raw)?raw:21600000,3600000);
    this.timer=setInterval(()=>void this.runAll().catch(e=>this.logger.error('Preventive maintenance generation failed',e instanceof Error?e.stack:undefined)),interval);
    this.timer.unref();
    void this.runAll().catch(e=>this.logger.error('Initial preventive maintenance generation failed',e instanceof Error?e.stack:undefined));
  }
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);}

  async runAll(){
    const societies=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "Society" WHERE "status"='ACTIVE'`);
    let eligible=0,generated=0;
    for(const society of societies){const result=await this.generateForSociety(society.id,null);eligible+=result.eligible;generated+=result.generated;}
    return {societies:societies.length,eligible,generated};
  }

  async generateForSociety(societyId:string,actorUserId:string|null){
    return this.prisma.$transaction(async tx=>{
      const plans=await tx.$queryRaw<Array<{id:string;assetId:string;title:string;description:string|null;frequencyDays:number;leadDays:number;priority:string;assignedUserId:string|null;nextDueAt:Date;createdByUserId:string}>>(Prisma.sql`
        SELECT p."id",p."assetId",p."title",p."description",p."frequencyDays",p."leadDays",p."priority",p."assignedUserId",p."nextDueAt",p."createdByUserId"
        FROM "FacilityMaintenancePlan" p JOIN "FacilityAsset" a ON a."id"=p."assetId"
        WHERE p."societyId"=${societyId}::uuid AND p."active"=TRUE AND a."status"='ACTIVE'
          AND p."nextDueAt"-(p."leadDays" * INTERVAL '1 day')<=CURRENT_TIMESTAMP
        ORDER BY p."nextDueAt" ASC FOR UPDATE OF p
      `);
      let generated=0;
      for(const p of plans){
        const scheduledAt=new Date(p.nextDueAt.getTime()-p.leadDays*86400000);
        const actor=actorUserId??p.createdByUserId;
        const inserted=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
          INSERT INTO "FacilityWorkOrder" ("societyId","assetId","maintenancePlanId","workType","priority","title","description","scheduledAt","dueAt","assignedUserId","createdByUserId")
          VALUES (${societyId}::uuid,${p.assetId}::uuid,${p.id}::uuid,'PREVENTIVE',${p.priority},${p.title},${p.description},${scheduledAt},${p.nextDueAt},${p.assignedUserId}::uuid,${actor}::uuid)
          ON CONFLICT ("maintenancePlanId","scheduledAt") WHERE "maintenancePlanId" IS NOT NULL DO NOTHING RETURNING "id"
        `);
        if(inserted.length)generated++;
        await tx.$executeRaw(Prisma.sql`UPDATE "FacilityMaintenancePlan" SET "lastGeneratedAt"=CURRENT_TIMESTAMP,"nextDueAt"="nextDueAt"+("frequencyDays" * INTERVAL '1 day'),"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${p.id}::uuid`);
      }
      return {eligible:plans.length,generated};
    });
  }

  async metrics(societyId:string){
    const rows=await this.prisma.$queryRaw<Array<Record<string,number>>>(Prisma.sql`
      SELECT
        (SELECT COUNT(*)::int FROM "FacilityAsset" WHERE "societyId"=${societyId}::uuid AND "status"='ACTIVE') AS "activeAssets",
        (SELECT COUNT(*)::int FROM "FacilityMaintenancePlan" WHERE "societyId"=${societyId}::uuid AND "active"=TRUE) AS "activePlans",
        (SELECT COUNT(*)::int FROM "FacilityWorkOrder" WHERE "societyId"=${societyId}::uuid AND "status" IN ('OPEN','IN_PROGRESS')) AS "activeWorkOrders",
        (SELECT COUNT(*)::int FROM "FacilityWorkOrder" WHERE "societyId"=${societyId}::uuid AND "status" IN ('OPEN','IN_PROGRESS') AND "dueAt"<CURRENT_TIMESTAMP) AS "overdueWorkOrders",
        (SELECT COUNT(*)::int FROM "FacilityOperationalAlert" WHERE "societyId"=${societyId}::uuid AND "status"='OPEN') AS "openAlerts",
        (SELECT COUNT(*)::int FROM "FacilityOperationalAlert" WHERE "societyId"=${societyId}::uuid AND "status"='OPEN' AND "severity"='CRITICAL') AS "criticalAlerts",
        (SELECT COUNT(*)::int FROM "FacilityServiceContract" WHERE "societyId"=${societyId}::uuid AND "status"='ACTIVE' AND "endsAt"<=CURRENT_TIMESTAMP+INTERVAL '30 days') AS "contractsExpiring30d"
    `);
    return rows[0];
  }
}
