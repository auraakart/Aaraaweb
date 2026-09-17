import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FinancialReportingService {
  constructor(private readonly prisma:PrismaService) {}

  trialBalance(societyId:string,asOf:string) {
    return this.prisma.$queryRaw(Prisma.sql`
      WITH totals AS (
        SELECT jl."accountId",SUM(jl."debitPaise") AS debit,SUM(jl."creditPaise") AS credit
        FROM "JournalLine" jl
        JOIN "JournalEntry" je ON je."id"=jl."entryId" AND je."societyId"=jl."societyId"
        WHERE jl."societyId"=${societyId}::uuid AND je."status" IN ('POSTED','REVERSED') AND je."entryDate"<=${asOf}::date
        GROUP BY jl."accountId"
      )
      SELECT la."id" AS "accountId",la."code",la."name",la."type"::text AS "type",
             COALESCE(t.debit,0)::text AS "debitPaise",COALESCE(t.credit,0)::text AS "creditPaise",
             (COALESCE(t.debit,0)-COALESCE(t.credit,0))::text AS "netDebitPaise"
      FROM "LedgerAccount" la LEFT JOIN totals t ON t."accountId"=la."id"
      WHERE la."societyId"=${societyId}::uuid ORDER BY la."code"
    `);
  }

  incomeExpense(societyId:string,from:string,to:string) {
    return this.prisma.$queryRaw(Prisma.sql`
      WITH totals AS (
        SELECT jl."accountId",SUM(jl."debitPaise") AS debit,SUM(jl."creditPaise") AS credit
        FROM "JournalLine" jl
        JOIN "JournalEntry" je ON je."id"=jl."entryId" AND je."societyId"=jl."societyId"
        WHERE jl."societyId"=${societyId}::uuid AND je."status" IN ('POSTED','REVERSED') AND je."entryDate" BETWEEN ${from}::date AND ${to}::date
        GROUP BY jl."accountId"
      )
      SELECT la."id" AS "accountId",la."code",la."name",la."type"::text AS "type",
             COALESCE(t.debit,0)::text AS "debitPaise",COALESCE(t.credit,0)::text AS "creditPaise",
             (CASE WHEN la."type"='INCOME' THEN COALESCE(t.credit,0)-COALESCE(t.debit,0) ELSE COALESCE(t.debit,0)-COALESCE(t.credit,0) END)::text AS "amountPaise"
      FROM "LedgerAccount" la LEFT JOIN totals t ON t."accountId"=la."id"
      WHERE la."societyId"=${societyId}::uuid AND la."type" IN ('INCOME','EXPENSE')
      ORDER BY la."type",la."code"
    `);
  }

  async balanceSheet(societyId:string,asOf:string) {
    const accounts=await this.prisma.$queryRaw<Array<{accountId:string;code:string;name:string;type:string;amountPaise:string}>>(Prisma.sql`
      WITH totals AS (
        SELECT jl."accountId",SUM(jl."debitPaise") AS debit,SUM(jl."creditPaise") AS credit
        FROM "JournalLine" jl
        JOIN "JournalEntry" je ON je."id"=jl."entryId" AND je."societyId"=jl."societyId"
        WHERE jl."societyId"=${societyId}::uuid AND je."status" IN ('POSTED','REVERSED') AND je."entryDate"<=${asOf}::date
        GROUP BY jl."accountId"
      )
      SELECT la."id" AS "accountId",la."code",la."name",la."type"::text AS "type",
             (CASE WHEN la."type"='ASSET' THEN COALESCE(t.debit,0)-COALESCE(t.credit,0) ELSE COALESCE(t.credit,0)-COALESCE(t.debit,0) END)::text AS "amountPaise"
      FROM "LedgerAccount" la LEFT JOIN totals t ON t."accountId"=la."id"
      WHERE la."societyId"=${societyId}::uuid AND la."type" IN ('ASSET','LIABILITY','EQUITY')
      ORDER BY la."type",la."code"
    `);
    const result=await this.prisma.$queryRaw<Array<{income:bigint;expense:bigint}>>(Prisma.sql`
      SELECT
        COALESCE(SUM(CASE WHEN la."type"='INCOME' THEN jl."creditPaise"-jl."debitPaise" ELSE 0 END),0) AS income,
        COALESCE(SUM(CASE WHEN la."type"='EXPENSE' THEN jl."debitPaise"-jl."creditPaise" ELSE 0 END),0) AS expense
      FROM "JournalLine" jl JOIN "JournalEntry" je ON je."id"=jl."entryId" AND je."societyId"=jl."societyId"
      JOIN "LedgerAccount" la ON la."id"=jl."accountId" AND la."societyId"=jl."societyId"
      WHERE jl."societyId"=${societyId}::uuid AND je."status" IN ('POSTED','REVERSED') AND je."entryDate"<=${asOf}::date
    `);
    const currentResult=(result[0]?.income??0n)-(result[0]?.expense??0n);
    const assets=accounts.filter(a=>a.type==='ASSET').reduce((n,a)=>n+BigInt(a.amountPaise),0n);
    const liabilities=accounts.filter(a=>a.type==='LIABILITY').reduce((n,a)=>n+BigInt(a.amountPaise),0n);
    const equity=accounts.filter(a=>a.type==='EQUITY').reduce((n,a)=>n+BigInt(a.amountPaise),0n);
    return {asOf,accounts,currentResultPaise:currentResult.toString(),assetTotalPaise:assets.toString(),liabilityTotalPaise:liabilities.toString(),equityTotalPaise:equity.toString(),balanceCheckPaise:(assets-liabilities-equity-currentResult).toString()};
  }

  defaulters(societyId:string,asOf:string) {
    return this.prisma.$queryRaw(Prisma.sql`
      WITH balances AS (
        SELECT r."id",r."unitId",r."dueDate",
          r."amountPaise"
          + COALESCE((SELECT SUM(CASE WHEN a."type"='DEBIT' THEN a."amountPaise" ELSE -a."amountPaise" END) FROM "ReceivableAdjustment" a WHERE a."societyId"=r."societyId" AND a."receivableId"=r."id"),0)
          - COALESCE((SELECT SUM(x."amountPaise") FROM "ReceivableAllocation" x WHERE x."societyId"=r."societyId" AND x."receivableId"=r."id"),0) AS outstanding
        FROM "Receivable" r
        WHERE r."societyId"=${societyId}::uuid AND r."status"<>'VOID' AND r."dueDate"<${asOf}::date
      )
      SELECT u."id" AS "unitId",bld."name" AS "buildingName",u."number" AS "unitNumber",
             SUM(b.outstanding)::text AS "outstandingPaise",COUNT(*) FILTER (WHERE b.outstanding>0)::int AS "openReceivableCount",
             MAX(${asOf}::date-b."dueDate")::int AS "maxDaysOverdue"
      FROM balances b JOIN "Unit" u ON u."id"=b."unitId" AND u."societyId"=${societyId}::uuid
      JOIN "Building" bld ON bld."id"=u."buildingId"
      WHERE b.outstanding>0 GROUP BY u."id",bld."name",u."number"
      ORDER BY SUM(b.outstanding) DESC,u."number" LIMIT 500
    `);
  }

  fundStatement(societyId:string,from:string,to:string) {
    return this.prisma.$queryRaw(Prisma.sql`
      WITH totals AS (
        SELECT jl."fundId",
          SUM(CASE WHEN je."entryDate"<${from}::date THEN jl."debitPaise"-jl."creditPaise" ELSE 0 END) AS opening,
          SUM(CASE WHEN je."entryDate" BETWEEN ${from}::date AND ${to}::date THEN jl."debitPaise" ELSE 0 END) AS period_debit,
          SUM(CASE WHEN je."entryDate" BETWEEN ${from}::date AND ${to}::date THEN jl."creditPaise" ELSE 0 END) AS period_credit,
          SUM(CASE WHEN je."entryDate"<=${to}::date THEN jl."debitPaise"-jl."creditPaise" ELSE 0 END) AS closing
        FROM "JournalLine" jl JOIN "JournalEntry" je ON je."id"=jl."entryId" AND je."societyId"=jl."societyId"
        WHERE jl."societyId"=${societyId}::uuid AND jl."fundId" IS NOT NULL AND je."status" IN ('POSTED','REVERSED')
        GROUP BY jl."fundId"
      )
      SELECT f."id" AS "fundId",f."code",f."name",f."restricted",
             COALESCE(t.opening,0)::text AS "openingNetDebitPaise",COALESCE(t.period_debit,0)::text AS "periodDebitPaise",
             COALESCE(t.period_credit,0)::text AS "periodCreditPaise",COALESCE(t.closing,0)::text AS "closingNetDebitPaise"
      FROM "AccountingFund" f LEFT JOIN totals t ON t."fundId"=f."id"
      WHERE f."societyId"=${societyId}::uuid ORDER BY f."code"
    `);
  }
}
