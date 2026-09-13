import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FacilitiesAlertsService implements OnModuleInit,OnModuleDestroy{
  private readonly logger=new Logger(FacilitiesAlertsService.name);
  private timer?:NodeJS.Timeout;
  constructor(private readonly prisma:PrismaService){}

  onModuleInit(){
    if(process.env.FACILITIES_ALERTS_AUTO_GENERATE!=='true')return;
    const raw=Number(process.env.FACILITIES_ALERTS_INTERVAL_MS??21600000);
    const interval=Math.max(Number.isFinite(raw)?raw:21600000,3600000);
    this.timer=setInterval(()=>void this.runAll().catch(e=>this.logger.error('Facilities alert generation failed',e instanceof Error?e.stack:undefined)),interval);
    this.timer.unref();
    void this.runAll().catch(e=>this.logger.error('Initial facilities alert generation failed',e instanceof Error?e.stack:undefined));
  }
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);}

  async runAll(){
    const rows=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "Society" WHERE "status"='ACTIVE'`);
    let generated=0;
    for(const s of rows)generated+=(await this.generateForSociety(s.id,this.windowDays())).generated;
    return {societies:rows.length,generated};
  }

  async generateForSociety(societyId:string,windowDays:number){
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
      generated+=await this.insert(societyId,'WORK_ORDER_OVERDUE','WORK_ORDER',w.id,w.priority==='CRITICAL'?'CRITICAL':'WARNING',`Overdue work order: ${w.title}`,`Work order is overdue since ${w.dueAt.toISOString()}.`,w.dueAt,`WORK_ORDER_OVERDUE:${w.id}`);
    }
    for(const c of contracts){
      const expired=c.endsAt.getTime()<Date.now();
      generated+=await this.insert(societyId,expired?'CONTRACT_EXPIRED':'CONTRACT_EXPIRING','SERVICE_CONTRACT',c.id,expired?'CRITICAL':'WARNING',`${c.contractType}: ${c.title}`,expired?`Contract expired on ${c.endsAt.toISOString()}.`:`Contract expires on ${c.endsAt.toISOString()}.`,c.endsAt,`CONTRACT_${expired?'EXPIRED':'EXPIRING'}:${c.id}`);
    }
    return {eligible:workOrders.length+contracts.length,generated};
  }

  private windowDays(){const raw=Number(process.env.FACILITIES_ALERTS_WINDOW_DAYS??30);return Math.min(Math.max(Number.isFinite(raw)?Math.floor(raw):30,1),120);}
  private async insert(societyId:string,alertType:string,sourceType:string,sourceId:string,severity:string,title:string,message:string,dueAt:Date,dedupKey:string){
    const rows=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`
      INSERT INTO "FacilityOperationalAlert" ("societyId","alertType","sourceType","sourceId","severity","title","message","dueAt","dedupKey")
      VALUES (${societyId}::uuid,${alertType},${sourceType},${sourceId}::uuid,${severity},${title},${message},${dueAt},${dedupKey})
      ON CONFLICT ("societyId","dedupKey") DO NOTHING RETURNING "id"
    `);
    return rows.length;
  }
}
