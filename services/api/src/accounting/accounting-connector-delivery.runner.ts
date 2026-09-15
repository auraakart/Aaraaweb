import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfiguredHttpAccountingConnectorAdapter } from './configured-http-accounting-connector.adapter';

type DeliveryJob={id:string;societyId:string;exportJobId:string;provider:string;idempotencyKey:string;attemptCount:number};
type DeliveryArtifact={contractVersion:string;format:'CSV'|'JSONL';filename:string;contentType:string;sha256:string;content:string};

@Injectable()
export class AccountingConnectorDeliveryRunner implements OnModuleInit,OnModuleDestroy{
  private readonly logger=new Logger(AccountingConnectorDeliveryRunner.name);
  private readonly intervalMs=Math.max(60_000,Number(process.env.ACCOUNTING_CONNECTOR_INTERVAL_MS??300_000));
  private readonly maxAttempts=Math.max(1,Number(process.env.ACCOUNTING_CONNECTOR_MAX_ATTEMPTS??5));
  private timer?:NodeJS.Timeout;
  private running=false;
  constructor(private readonly prisma:PrismaService,private readonly adapter:ConfiguredHttpAccountingConnectorAdapter){}

  onModuleInit(){
    if((process.env.ACCOUNTING_CONNECTOR_AUTO_DELIVER??'false').toLowerCase()!=='true'){this.logger.log('Accounting connector auto-delivery disabled');return;}
    if(!(process.env.ACCOUNTING_CONNECTOR_BASE_URL??'').trim()){this.logger.warn('Accounting connector auto-delivery requested but bridge is not configured');return;}
    this.timer=setInterval(()=>void this.runOnce(),this.intervalMs);this.timer.unref();void this.runOnce();
  }
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);}

  async runOnce(){if(this.running)return;this.running=true;try{await this.seedCompletedExports();for(const job of await this.claim(20))await this.deliver(job);}catch(error){this.logger.error(`Accounting connector cycle failed: ${this.message(error)}`);}finally{this.running=false;}}

  private async seedCompletedExports(){
    const provider=this.adapter.provider;
    if(!provider)return;
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "AccountingConnectorDelivery" ("societyId","exportJobId","provider","idempotencyKey")
      SELECT j."societyId",j."id",${provider},('accounting-export:'||j."id"::text||':'||${provider})
      FROM "AccountingExportJob" j
      JOIN "AccountingExportArtifact" a ON a."jobId"=j."id" AND a."societyId"=j."societyId"
      WHERE j."status"='COMPLETED'
      ON CONFLICT ("societyId","exportJobId","provider") DO NOTHING
    `);
  }

  private claim(limit:number){return this.prisma.$transaction(async tx=>{
    const rows=await tx.$queryRaw<DeliveryJob[]>(Prisma.sql`
      WITH due AS (
        SELECT "id" FROM "AccountingConnectorDelivery"
        WHERE (
          ("status" IN ('QUEUED','ACCEPTED','UNKNOWN') AND ("nextAttemptAt" IS NULL OR "nextAttemptAt"<=CURRENT_TIMESTAMP))
          OR ("status"='PROCESSING' AND "leaseUntil"<CURRENT_TIMESTAMP)
        )
        ORDER BY COALESCE("nextAttemptAt","createdAt"),"createdAt"
        FOR UPDATE SKIP LOCKED LIMIT ${limit}
      )
      UPDATE "AccountingConnectorDelivery" d
      SET "status"='PROCESSING',"attemptCount"=d."attemptCount"+1,"lastAttemptAt"=CURRENT_TIMESTAMP,
          "leaseUntil"=CURRENT_TIMESTAMP+make_interval(secs=>${Math.max(60,Math.floor(this.intervalMs/1000)*2)}),"updatedAt"=CURRENT_TIMESTAMP
      FROM due WHERE d."id"=due."id"
      RETURNING d."id",d."societyId",d."exportJobId",d."provider",d."idempotencyKey",d."attemptCount"
    `);
    return rows;
  });}

  private async deliver(job:DeliveryJob){
    if(job.provider!==this.adapter.provider){await this.fail(job,'UNSUPPORTED_PROVIDER',`No configured adapter for ${job.provider}`);return;}
    try{
      const artifacts=await this.prisma.$queryRaw<DeliveryArtifact[]>(Prisma.sql`
        SELECT j."contractVersion",j."format",a."filename",a."contentType",a."sha256",a."content"
        FROM "AccountingConnectorDelivery" d
        JOIN "AccountingExportJob" j ON j."id"=d."exportJobId" AND j."societyId"=d."societyId"
        JOIN "AccountingExportArtifact" a ON a."jobId"=j."id" AND a."societyId"=j."societyId"
        WHERE d."id"=${job.id}::uuid AND d."societyId"=${job.societyId}::uuid AND j."status"='COMPLETED' LIMIT 1
      `);
      const artifact=artifacts[0];if(!artifact)throw new Error('EXPORT_ARTIFACT_NOT_READY');
      const result=await this.adapter.deliver({societyId:job.societyId,exportJobId:job.exportJobId,contractVersion:artifact.contractVersion,format:artifact.format,filename:artifact.filename,contentType:artifact.contentType,sha256:artifact.sha256,content:Buffer.from(artifact.content,'utf8'),idempotencyKey:job.idempotencyKey});
      const terminal=result.status==='DELIVERED'||result.status==='FAILED';
      const delay=Math.min(3600,Math.pow(2,Math.max(0,job.attemptCount-1))*60);
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "AccountingConnectorDelivery"
        SET "status"=${result.status},"providerReceiptId"=${result.providerReceiptId??null},"failureCode"=${result.failureCode??null},"failureMessage"=${this.bounded(result.failureMessage)},
            "nextAttemptAt"=${terminal?null:Prisma.sql`CURRENT_TIMESTAMP+make_interval(secs=>${delay})`},"leaseUntil"=NULL,
            "completedAt"=${terminal?Prisma.sql`CURRENT_TIMESTAMP`:null},"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${job.id}::uuid AND "societyId"=${job.societyId}::uuid AND "status"='PROCESSING'
      `);
    }catch(error){
      const exhausted=job.attemptCount>=this.maxAttempts;
      await this.fail(job,exhausted?'DELIVERY_RETRY_EXHAUSTED':'DELIVERY_RETRY',this.message(error),exhausted);
    }
  }

  private async fail(job:DeliveryJob,code:string,message:string,terminal=true){
    const delay=Math.min(3600,Math.pow(2,Math.max(0,job.attemptCount-1))*60);
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "AccountingConnectorDelivery"
      SET "status"=${terminal?'FAILED':'UNKNOWN'},"failureCode"=${code},"failureMessage"=${this.bounded(message)},
          "nextAttemptAt"=${terminal?null:Prisma.sql`CURRENT_TIMESTAMP+make_interval(secs=>${delay})`},"leaseUntil"=NULL,
          "completedAt"=${terminal?Prisma.sql`CURRENT_TIMESTAMP`:null},"updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${job.id}::uuid AND "societyId"=${job.societyId}::uuid AND "status"='PROCESSING'
    `);
  }
  private bounded(value:string|undefined){return value?value.slice(0,500):null;}
  private message(error:unknown){return error instanceof Error?error.message:String(error);}
}
