import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentReconciliationObservabilityService{
  constructor(private readonly prisma:PrismaService){}
  async metrics(societyId:string){
    const [cases]=await this.prisma.$queryRaw<Array<{pending:bigint;matched:bigint;mismatch:bigint;actionRequired:bigint;resolved:bigint}>>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE "status"='PENDING')::bigint AS pending,
        COUNT(*) FILTER (WHERE "status"='MATCHED')::bigint AS matched,
        COUNT(*) FILTER (WHERE "status"='MISMATCH')::bigint AS mismatch,
        COUNT(*) FILTER (WHERE "status"='ACTION_REQUIRED')::bigint AS "actionRequired",
        COUNT(*) FILTER (WHERE "status"='RESOLVED')::bigint AS resolved
      FROM "PaymentReconciliationCase" WHERE "societyId"=${societyId}::uuid
    `);
    const [ops]=await this.prisma.$queryRaw<Array<{requested:bigint;unknown:bigint;failed:bigint;settled:bigint;retryExhausted:bigint}>>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE "status"='REQUESTED')::bigint AS requested,
        COUNT(*) FILTER (WHERE "status"='UNKNOWN')::bigint AS unknown,
        COUNT(*) FILTER (WHERE "status"='FAILED')::bigint AS failed,
        COUNT(*) FILTER (WHERE "status"='SETTLED')::bigint AS settled,
        COUNT(*) FILTER (WHERE "status"='FAILED' AND "failureCode"='RUNNER_EXHAUSTED')::bigint AS "retryExhausted"
      FROM "PaymentGatewayOperation" WHERE "societyId"=${societyId}::uuid
    `);
    return {cases:this.stringify(cases),operations:this.stringify(ops)};
  }
  private stringify<T extends Record<string,bigint>>(row:T){return Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value.toString()]));}
}
