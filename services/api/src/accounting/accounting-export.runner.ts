import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { safeOperationalError } from '../observability/safe-operational-error';
import { AccountingExportService } from './accounting-export.service';

type ClaimedJob=Parameters<AccountingExportService['executeClaimed']>[0];

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

  private async claimOne(){
    const rows=await this.prisma.$queryRaw<ClaimedJob[]>(Prisma.sql`
      SELECT * FROM aaraagate_claim_accounting_export(${this.leaseSeconds}::integer)
    `);
    return rows[0]??null;
  }

  private message(error:unknown){return safeOperationalError(error);}
}
