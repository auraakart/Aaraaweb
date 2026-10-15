import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type FacilityOperationsCategory = 'HOUSEKEEPING'|'STAFF';
export type FacilityOperationsStatus = 'OPEN'|'IN_PROGRESS'|'COMPLETED'|'CANCELLED';

type CreateTaskInput = {
  category: FacilityOperationsCategory;
  title: string;
  location?: string;
  scheduledAt?: string;
  dueAt?: string;
  assignedUserId?: string;
};

@Injectable()
export class FacilitiesOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  listTasks(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT t.*,u."name" AS "assignedUserName",u."phone" AS "assignedUserPhone"
      FROM "FacilityOperationsTask" t
      LEFT JOIN "User" u ON u."id"=t."assignedUserId"
      WHERE t."societyId"=${societyId}::uuid
      ORDER BY COALESCE(t."scheduledAt",t."createdAt") DESC,t."createdAt" DESC
      LIMIT 1000
    `);
  }

  async listEvents(societyId: string, taskId: string) {
    await this.assertTask(societyId,taskId);
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT * FROM "FacilityOperationsTaskEvent"
      WHERE "societyId"=${societyId}::uuid AND "taskId"=${taskId}::uuid
      ORDER BY "occurredAt" ASC,"id" ASC
    `);
  }

  async createTask(societyId: string, actorUserId: string, input: CreateTaskInput) {
    const scheduledAt=input.scheduledAt?new Date(input.scheduledAt):null;
    const dueAt=input.dueAt?new Date(input.dueAt):null;
    if(scheduledAt&&!Number.isFinite(scheduledAt.getTime())) throw new BadRequestException('Invalid scheduledAt');
    if(dueAt&&!Number.isFinite(dueAt.getTime())) throw new BadRequestException('Invalid dueAt');
    if(scheduledAt&&dueAt&&dueAt<scheduledAt) throw new BadRequestException('Due time cannot precede scheduled time');
    if(input.assignedUserId) await this.assertActiveMember(societyId,input.assignedUserId);

    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<Array<Record<string,unknown>&{id:string}>>(Prisma.sql`
        INSERT INTO "FacilityOperationsTask" (
          "societyId","category","title","location","scheduledAt","dueAt","assignedUserId","createdByUserId"
        ) VALUES (
          ${societyId}::uuid,${input.category},${input.title.trim()},${input.location?.trim()||null},
          ${scheduledAt},${dueAt},${input.assignedUserId??null}::uuid,${actorUserId}::uuid
        ) RETURNING *
      `);
      const task=rows[0];
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "FacilityOperationsTaskEvent" ("societyId","taskId","eventType","toStatus","note","actorUserId")
        VALUES (${societyId}::uuid,${task.id}::uuid,'CREATED','OPEN',${input.location?.trim()||null},${actorUserId}::uuid)
      `);
      if(input.assignedUserId){
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "FacilityOperationsTaskEvent" ("societyId","taskId","eventType","toStatus","note","actorUserId")
          VALUES (${societyId}::uuid,${task.id}::uuid,'ASSIGNED','OPEN',${`Assigned to ${input.assignedUserId}`},${actorUserId}::uuid)
        `);
      }
      return task;
    });
  }

  async setStatus(societyId:string,actorUserId:string,taskId:string,status:FacilityOperationsStatus,completionNote?:string){
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<Array<{status:FacilityOperationsStatus}>>(Prisma.sql`
        SELECT "status" FROM "FacilityOperationsTask"
        WHERE "id"=${taskId}::uuid AND "societyId"=${societyId}::uuid
        FOR UPDATE
      `);
      const current=rows[0]?.status;
      if(!current) throw new BadRequestException('Facility operations task not found');
      const allowed=(current==='OPEN'&&(status==='IN_PROGRESS'||status==='COMPLETED'||status==='CANCELLED'))||(current==='IN_PROGRESS'&&(status==='COMPLETED'||status==='CANCELLED'));
      if(!allowed) throw new BadRequestException(`Task cannot transition from ${current} to ${status}`);
      const note=completionNote?.trim()||null;
      if(status==='COMPLETED'&&(!note||note.length<5)) throw new BadRequestException('Completed tasks require a completion note');
      const updated=await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        UPDATE "FacilityOperationsTask"
        SET "status"=${status},
            "completionNote"=CASE WHEN ${status}='COMPLETED' THEN ${note} ELSE "completionNote" END,
            "completedAt"=CASE WHEN ${status}='COMPLETED' THEN CURRENT_TIMESTAMP ELSE "completedAt" END,
            "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${taskId}::uuid AND "societyId"=${societyId}::uuid
        RETURNING *
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "FacilityOperationsTaskEvent" ("societyId","taskId","eventType","fromStatus","toStatus","note","actorUserId")
        VALUES (${societyId}::uuid,${taskId}::uuid,'STATUS_CHANGED',${current},${status},${note},${actorUserId}::uuid)
      `);
      return updated[0];
    });
  }

  private async assertTask(societyId:string,taskId:string){
    const rows=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "FacilityOperationsTask" WHERE "id"=${taskId}::uuid AND "societyId"=${societyId}::uuid LIMIT 1`);
    if(!rows.length) throw new BadRequestException('Facility operations task not found');
  }

  private async assertActiveMember(societyId:string,userId:string){
    const rows=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "SocietyMembership" WHERE "societyId"=${societyId}::uuid AND "userId"=${userId}::uuid AND "active"=TRUE LIMIT 1`);
    if(!rows.length) throw new BadRequestException('Assigned user must have an active membership in this society');
  }
}
