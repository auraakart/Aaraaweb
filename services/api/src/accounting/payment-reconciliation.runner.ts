import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfiguredHttpPaymentGatewayAdapter } from './configured-http-payment-gateway.adapter';
import { PaymentReconciliationService } from './payment-reconciliation.service';

type DueOperation={id:string;societyId:string;paymentId:string;operationType:'STATUS_QUERY'|'REFUND';provider:string;providerOperationId:string|null;amountPaise:bigint|null;idempotencyKey:string;attemptCount:number};
type DueCase={id:string;societyId:string;paymentId:string;provider:string};

@Injectable()
export class PaymentReconciliationRunner implements OnModuleInit,OnModuleDestroy{
  private readonly logger=new Logger(PaymentReconciliationRunner.name);
  private readonly intervalMs=Math.max(60_000,Number(process.env.PAYMENT_RECONCILIATION_INTERVAL_MS??300_000));
  private readonly maxAttempts=Math.max(1,Number(process.env.PAYMENT_RECONCILIATION_MAX_ATTEMPTS??5));
  private timer?:NodeJS.Timeout;
  private running=false;
  constructor(private readonly prisma:PrismaService,private readonly adapter:ConfiguredHttpPaymentGatewayAdapter,private readonly reconciliation:PaymentReconciliationService){}

  onModuleInit(){if(!(process.env.PAYMENT_GATEWAY_RECONCILIATION_BASE_URL??'').trim()){this.logger.log('Payment reconciliation runner disabled: gateway bridge not configured');return;}this.timer=setInterval(()=>void this.runOnce(),this.intervalMs);this.timer.unref();void this.runOnce();}
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);}

  async runOnce(){if(this.running)return;this.running=true;try{await this.processOperations();await this.refreshCases();}catch(error){this.logger.error(`Payment reconciliation cycle failed: ${this.message(error)}`);}finally{this.running=false;}}

  private async processOperations(){
    const due=await this.claimOperations(25);
    for(const op of due){
      if(op.provider!==this.adapter.provider){await this.deferUnsupported(op);continue;}
      try{
        if(op.operationType==='STATUS_QUERY'){
          const observation=await this.adapter.queryPayment(op.paymentId);
          const c=await this.reconciliation.openOrRefreshCase(op.societyId,op.paymentId,op.provider);
          await this.reconciliation.recordObservation(op.societyId,String((c as {id:string}).id),{providerPaymentId:observation.providerPaymentId,observedProviderStatus:observation.providerStatus,observedAmountPaise:observation.amountPaise});
          await this.reconciliation.recordOperationResult(op.societyId,op.id,{status:'SETTLED',providerOperationId:op.providerOperationId??undefined});
        }else{
          const result=await this.adapter.refund({paymentId:op.paymentId,providerOperationId:op.providerOperationId??undefined,amountPaise:op.amountPaise===null?undefined:Number(op.amountPaise),idempotencyKey:op.idempotencyKey});
          await this.reconciliation.recordOperationResult(op.societyId,op.id,result);
        }
      }catch(error){
        const exhausted=op.attemptCount>=this.maxAttempts;
        await this.reconciliation.recordOperationResult(op.societyId,op.id,{status:exhausted?'FAILED':'UNKNOWN',failureCode:exhausted?'RUNNER_EXHAUSTED':'RUNNER_RETRY',failureMessage:this.message(error).slice(0,500)}).catch(e=>this.logger.error(`Could not persist gateway retry result ${op.id}: ${this.message(e)}`));
      }
    }
  }

  private async refreshCases(){
    const cases=await this.claimCases(25);
    for(const c of cases){if(c.provider!==this.adapter.provider)continue;try{const observation=await this.adapter.queryPayment(c.paymentId);await this.reconciliation.recordObservation(c.societyId,c.id,{providerPaymentId:observation.providerPaymentId,observedProviderStatus:observation.providerStatus,observedAmountPaise:observation.amountPaise});}catch(error){this.logger.warn(`Reconciliation case ${c.id} refresh failed: ${this.message(error)}`);}}
  }

  private claimOperations(limit:number){return this.prisma.$transaction(async tx=>{
    const rows=await tx.$queryRaw<DueOperation[]>(Prisma.sql`
      SELECT "id","societyId","paymentId","operationType","provider","providerOperationId","amountPaise","idempotencyKey","attemptCount"
      FROM "PaymentGatewayOperation"
      WHERE "status" IN ('REQUESTED','UNKNOWN') AND ("nextAttemptAt" IS NULL OR "nextAttemptAt"<=CURRENT_TIMESTAMP)
      ORDER BY COALESCE("nextAttemptAt","requestedAt"),"requestedAt" FOR UPDATE SKIP LOCKED LIMIT ${limit}
    `);
    for(const row of rows){const nextAttempt=row.attemptCount+1;const delay=Math.min(3600,Math.pow(2,Math.max(0,nextAttempt-1))*60);await tx.$executeRaw(Prisma.sql`UPDATE "PaymentGatewayOperation" SET "attemptCount"=${nextAttempt},"lastAttemptAt"=CURRENT_TIMESTAMP,"nextAttemptAt"=CURRENT_TIMESTAMP+make_interval(secs=>${delay}),"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${row.id}::uuid AND "societyId"=${row.societyId}::uuid`);row.attemptCount=nextAttempt;}
    return rows;
  });}

  private claimCases(limit:number){const staleSeconds=Math.floor(this.intervalMs/1000);return this.prisma.$transaction(async tx=>tx.$queryRaw<DueCase[]>(Prisma.sql`
    WITH due AS (
      SELECT "id" FROM "PaymentReconciliationCase"
      WHERE "status" IN ('PENDING','MISMATCH','ACTION_REQUIRED') AND ("lastCheckedAt" IS NULL OR "lastCheckedAt"<CURRENT_TIMESTAMP-make_interval(secs=>${staleSeconds}))
      ORDER BY COALESCE("lastCheckedAt","createdAt") FOR UPDATE SKIP LOCKED LIMIT ${limit}
    )
    UPDATE "PaymentReconciliationCase" c SET "lastCheckedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP FROM due WHERE c."id"=due."id"
    RETURNING c."id",c."societyId",c."paymentId",c."provider"
  `));}

  private async deferUnsupported(op:DueOperation){const exhausted=op.attemptCount>=this.maxAttempts;await this.reconciliation.recordOperationResult(op.societyId,op.id,{status:exhausted?'FAILED':'UNKNOWN',failureCode:'UNSUPPORTED_PROVIDER',failureMessage:`No configured adapter for ${op.provider}`});}
  private message(error:unknown){return error instanceof Error?error.message:String(error);}
}
