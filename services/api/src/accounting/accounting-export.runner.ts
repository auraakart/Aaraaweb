import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingExportService, ExportJob } from './accounting-export.service';

type ClaimedJob=ExportJob&{societyId:string};

@Injectable()
export class AccountingExportRunner implements OnModuleInit,OnModuleDestroy{
  private readonly logger=new Logger(AccountingExportRunner.name);
  private readonly intervalMs=Math.max(30_000,Number(process.env.ACCOUNTING_EXPORT_INTERVAL_MS??60_000));
  private readonly leaseSeconds=Math.max(60,Number(process.env.ACCOUNTING_EXPORT_LEASE_SECONDS??300));
  private timer?:NodeJS.Timeout;
  private running=false;

  constructor(private readonly prisma:PrismaService,private readonly exports:AccountingExportService){}

  onModuleInit(){this.timer=setInterval(()=>void this.runOnce(),this.intervalMs);this.timer.unref();void this.runOnce();}
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);}

  async runOnce(){if(this.running)return;this.running=true;try{for(;;){const job=await this.claimOne();if(!job)break;await this.exports.executeClaimed(job);}}catch(error){this.logger.error(`Accounting export cycle failed: ${this.message(error)}`);}finally{this.running=false;}}

  private claimOne(){return this.prisma.$transaction(async tx=>{
    const rows=await tx.$queryRaw<ClaimedJob[]>(Prisma.sql`
      WITH candidate AS (
        SELECT "id" FROM "AccountingExportJob"
        WHERE "status"='QUEUED' OR ("status"='PROCESSING' AND "leaseUntil"<CURRENT_TIMESTAMP)
        ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE "AccountingExportJob" j
      SET "status"='PROCESSING',"attemptCount"=j."attemptCount"+1,"lastAttemptAt"=CURRENT_TIMESTAMP,
          "leaseUntil"=CURRENT_TIMESTAMP+make_interval(secs=>${this.leaseSeconds}),"errorCode"=NULL
      FROM candidate WHERE j."id"=candidate."id"
      RETURNING j.*
    `);
    return rows[0]??null;
  });}

  private message(error:unknown){return error instanceof Error?error.message:String(error);}
}
