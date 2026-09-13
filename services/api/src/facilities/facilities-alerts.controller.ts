import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import { Prisma } from '@prisma/client';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { PrismaService } from '../prisma/prisma.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);
class GenerateAlertsDto{@IsInt() @Min(1) @Max(120) windowDays=30;}
class AlertStatusDto{@IsIn(['ACKNOWLEDGED','RESOLVED']) status!:'ACKNOWLEDGED'|'RESOLVED';}

@Controller('facilities/alerts')
@UseGuards(BearerGuard,TenantGuard,PermissionsGuard)
export class FacilitiesAlertsController{
  constructor(private readonly prisma:PrismaService){}

  @Get()
  @RequiresPermissions(AppPermission.FACILITIES_READ)
  list(@CurrentTenant() societyId:string){return this.prisma.$queryRaw(Prisma.sql`
    SELECT * FROM "FacilityOperationalAlert"
    WHERE "societyId"=${societyId}::uuid
    ORDER BY CASE "severity" WHEN 'CRITICAL' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END,"dueAt" ASC NULLS LAST,"createdAt" DESC
  `);}

  @Post('generate')
  @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  async generate(@CurrentTenant() societyId:string,@Body() dto:GenerateAlertsDto){return this.generateForSociety(societyId,dto.windowDays);}

  @Post(':id/status')
  @RequiresPermissions(AppPermission.FACILITIES_MANAGE)
  async setStatus(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:AlertStatusDto){
    if(!userId)throw new BadRequestException('Authenticated user is required');
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      UPDATE "FacilityOperationalAlert"
      SET "status"=${dto.status},"acknowledgedAt"=CASE WHEN ${dto.status}='ACKNOWLEDGED' THEN CURRENT_TIMESTAMP ELSE "acknowledgedAt" END,
          "acknowledgedByUserId"=CASE WHEN ${dto.status}='ACKNOWLEDGED' THEN ${userId}::uuid ELSE "acknowledgedByUserId" END,
          "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid RETURNING *
    `);
    if(!rows.length)throw new BadRequestException('Facility alert not found');
    return rows[0];
  }

  private async generateForSociety(societyId:string,windowDays:number){
    const workOrders=await this.prisma.$queryRaw<Array<{id:string;title:string;dueAt:Date;priority:string}>>(Prisma.sql`
      SELECT "id","title","dueAt","priority" FROM "FacilityWorkOrder"
      WHERE "societyId"=${societyId}::uuid AND "status" IN ('OPEN','IN_PROGRESS') AND "dueAt" IS NOT NULL AND "dueAt"<CURRENT_TIMESTAMP
    `);
    const contracts=await this.prisma.$queryRaw<Array<{id:string;title:string;endsAt:Date;contractType:string}>>(Prisma.sql`
      SELECT "id","title","endsAt","contractType" FROM "FacilityServiceContract"
      WHERE "societyId"=${societyId}::uuid AND "status"='ACTIVE' AND "endsAt"<=CURRENT_TIMESTAMP+(${windowDays} * INTERVAL '1 day')
    `);
    let generated=0;
    for(const w of workOrders){
      const key=`WORK_ORDER_OVERDUE:${w.id}`;
      const severity=w.priority==='CRITICAL'?'CRITICAL':'WARNING';
      generated+=await this.insertAlert(societyId,'WORK_ORDER_OVERDUE','WORK_ORDER',w.id,severity,`Overdue work order: ${w.title}`,`Work order is overdue since ${w.dueAt.toISOString()}.`,w.dueAt,key);
    }
    for(const c of contracts){
      const expired=c.endsAt.getTime()<Date.now();
      const key=`CONTRACT_${expired?'EXPIRED':'EXPIRING'}:${c.id}`;
      generated+=await this.insertAlert(societyId,expired?'CONTRACT_EXPIRED':'CONTRACT_EXPIRING','SERVICE_CONTRACT',c.id,expired?'CRITICAL':'WARNING',`${c.contractType}: ${c.title}`,expired?`Contract expired on ${c.endsAt.toISOString()}.`:`Contract expires on ${c.endsAt.toISOString()}.`,c.endsAt,key);
    }
    return {eligible:workOrders.length+contracts.length,generated};
  }

  private async insertAlert(societyId:string,alertType:string,sourceType:string,sourceId:string,severity:string,title:string,message:string,dueAt:Date,dedupKey:string){
    const rows=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`
      INSERT INTO "FacilityOperationalAlert" ("societyId","alertType","sourceType","sourceId","severity","title","message","dueAt","dedupKey")
      VALUES (${societyId}::uuid,${alertType},${sourceType},${sourceId}::uuid,${severity},${title},${message},${dueAt},${dedupKey})
      ON CONFLICT ("societyId","dedupKey") DO NOTHING RETURNING "id"
    `);
    return rows.length;
  }
}
