import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type CreateExpenseInput = { expenseNumber:string; vendorName:string; invoiceReference?:string; expenseDate:string; dueDate?:string; description:string; amountPaise:number; expenseAccountId:string; fundId?:string };
type ApproveExpenseInput = { payableAccountId:string };
type SettlePayableInput = { amountPaise:number; settlementDate:string; journalEntryId:string; idempotencyKey:string; reference?:string };
type CreateBudgetInput = { code:string; name:string; startsOn:string; endsOn:string; lines:Array<{accountId:string; fundId?:string; amountPaise:number; notes?:string}> };

@Injectable()
export class FinanceOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  listExpenses(societyId:string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT e."id",e."expenseNumber",e."vendorName",e."invoiceReference",e."expenseDate",e."dueDate",e."description",
             e."amountPaise"::text AS "amountPaise",e."status",e."expenseAccountId",e."fundId",e."journalEntryId",
             e."approvedAt",p."id" AS "payableId",p."status" AS "payableStatus",
             COALESCE(p."originalAmountPaise",0)::text AS "payableOriginalPaise",
             COALESCE(p."originalAmountPaise",0)-COALESCE(SUM(ps."amountPaise"),0) AS "payableOutstandingRaw"
      FROM "SocietyExpense" e
      LEFT JOIN "SocietyPayable" p ON p."expenseId"=e."id" AND p."societyId"=e."societyId"
      LEFT JOIN "PayableSettlement" ps ON ps."payableId"=p."id" AND ps."societyId"=p."societyId"
      WHERE e."societyId"=${societyId}::uuid
      GROUP BY e."id",p."id" ORDER BY e."expenseDate" DESC,e."createdAt" DESC LIMIT 250
    `);
  }

  async createExpense(societyId:string,userId:string,input:CreateExpenseInput) {
    if (input.amountPaise<=0) throw new BadRequestException('Expense amount must be positive');
    if (input.dueDate && input.dueDate<input.expenseDate) throw new BadRequestException('Due date cannot be before expense date');
    try {
      const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        INSERT INTO "SocietyExpense" ("societyId","expenseNumber","vendorName","invoiceReference","expenseDate","dueDate","description","amountPaise","expenseAccountId","fundId","createdByUserId")
        VALUES (${societyId}::uuid,${input.expenseNumber.trim().toUpperCase()},${input.vendorName.trim()},${input.invoiceReference?.trim()||null},${input.expenseDate}::date,${input.dueDate||null}::date,${input.description.trim()},${input.amountPaise},${input.expenseAccountId}::uuid,${input.fundId??null}::uuid,${userId}::uuid)
        RETURNING "id","expenseNumber","status","amountPaise"::text AS "amountPaise"
      `); return rows[0];
    } catch(e){this.rethrow(e,'Expense could not be created');}
  }

  async approveExpense(societyId:string,userId:string,expenseId:string,input:ApproveExpenseInput) {
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<Array<{id:string;status:string;amountPaise:bigint;dueDate:Date|null}>>(Prisma.sql`
        SELECT "id","status","amountPaise","dueDate" FROM "SocietyExpense" WHERE "id"=${expenseId}::uuid AND "societyId"=${societyId}::uuid FOR UPDATE
      `); const e=rows[0]; if(!e) throw new NotFoundException('Expense not found'); if(e.status!=='DRAFT') throw new ConflictException('Only draft expenses can be approved');
      await tx.$executeRaw(Prisma.sql`UPDATE "SocietyExpense" SET "status"='APPROVED',"approvedByUserId"=${userId}::uuid,"approvedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${expenseId}::uuid AND "societyId"=${societyId}::uuid`);
      const p=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
        INSERT INTO "SocietyPayable" ("societyId","expenseId","payableAccountId","originalAmountPaise","dueDate") VALUES (${societyId}::uuid,${expenseId}::uuid,${input.payableAccountId}::uuid,${e.amountPaise},${e.dueDate}) RETURNING "id"
      `); return {expenseId,payableId:p[0].id,status:'APPROVED'};
    }).catch(e=>this.rethrow(e,'Expense could not be approved'));
  }

  async postExpense(societyId:string,userId:string,expenseId:string,entryNumber:string) {
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<Array<{id:string;status:string;expenseDate:Date;description:string;amountPaise:bigint;expenseAccountId:string;fundId:string|null}>>(Prisma.sql`
        SELECT "id","status","expenseDate","description","amountPaise","expenseAccountId","fundId" FROM "SocietyExpense" WHERE "id"=${expenseId}::uuid AND "societyId"=${societyId}::uuid FOR UPDATE
      `); const e=rows[0]; if(!e) throw new NotFoundException('Expense not found'); if(e.status!=='APPROVED') throw new ConflictException('Only approved expenses can be posted');
      const payable=await tx.$queryRaw<Array<{payableAccountId:string}>>(Prisma.sql`SELECT "payableAccountId" FROM "SocietyPayable" WHERE "expenseId"=${expenseId}::uuid AND "societyId"=${societyId}::uuid FOR UPDATE`); if(!payable.length) throw new ConflictException('Approved expense has no payable');
      const periods=await tx.$queryRaw<Array<{id:string;status:string}>>(Prisma.sql`SELECT "id","status" FROM "AccountingPeriod" WHERE "societyId"=${societyId}::uuid AND ${e.expenseDate}::date BETWEEN "startsOn" AND "endsOn" ORDER BY "startsOn" DESC LIMIT 1 FOR UPDATE`); if(!periods.length||periods[0].status!=='OPEN') throw new ConflictException('Expense date requires an open accounting period');
      const jr=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
        INSERT INTO "JournalEntry" ("societyId","periodId","entryNumber","entryDate","description","sourceType","sourceId","createdByUserId") VALUES (${societyId}::uuid,${periods[0].id}::uuid,${entryNumber.trim().toUpperCase()},${e.expenseDate}::date,${`Expense: ${e.description}`},'SOCIETY_EXPENSE',${expenseId},${userId}::uuid) RETURNING "id"
      `); const journalId=jr[0].id;
      await tx.$executeRaw(Prisma.sql`INSERT INTO "JournalLine" ("societyId","entryId","accountId","fundId","description","debitPaise","creditPaise") VALUES (${societyId}::uuid,${journalId}::uuid,${e.expenseAccountId}::uuid,${e.fundId}::uuid,'Expense',${e.amountPaise},0),(${societyId}::uuid,${journalId}::uuid,${payable[0].payableAccountId}::uuid,${e.fundId}::uuid,'Payable',0,${e.amountPaise})`);
      await tx.$executeRaw(Prisma.sql`UPDATE "JournalEntry" SET "status"='POSTED',"postedByUserId"=${userId}::uuid,"postedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${journalId}::uuid AND "societyId"=${societyId}::uuid AND "status"='DRAFT'`);
      await tx.$executeRaw(Prisma.sql`UPDATE "SocietyExpense" SET "status"='POSTED',"journalEntryId"=${journalId}::uuid,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${expenseId}::uuid AND "societyId"=${societyId}::uuid`);
      return {expenseId,journalId,status:'POSTED'};
    }).catch(e=>this.rethrow(e,'Expense could not be posted'));
  }

  listPayables(societyId:string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT p."id",p."expenseId",e."expenseNumber",e."vendorName",p."status",p."dueDate",p."originalAmountPaise"::text AS "originalAmountPaise",
             (p."originalAmountPaise"-COALESCE(SUM(s."amountPaise"),0))::text AS "outstandingPaise"
      FROM "SocietyPayable" p JOIN "SocietyExpense" e ON e."id"=p."expenseId" AND e."societyId"=p."societyId"
      LEFT JOIN "PayableSettlement" s ON s."payableId"=p."id" AND s."societyId"=p."societyId"
      WHERE p."societyId"=${societyId}::uuid GROUP BY p."id",e."id" ORDER BY p."dueDate" NULLS LAST,e."expenseDate" DESC
    `);
  }

  async settlePayable(societyId:string,userId:string,payableId:string,input:SettlePayableInput) {
    if(input.amountPaise<=0) throw new BadRequestException('Settlement amount must be positive');
    return this.prisma.$transaction(async tx=>{
      const p=await tx.$queryRaw<Array<{id:string;originalAmountPaise:bigint;status:string}>>(Prisma.sql`SELECT "id","originalAmountPaise","status" FROM "SocietyPayable" WHERE "id"=${payableId}::uuid AND "societyId"=${societyId}::uuid FOR UPDATE`); if(!p.length) throw new NotFoundException('Payable not found'); if(p[0].status==='PAID'||p[0].status==='VOID') throw new ConflictException('Payable is not open');
      const j=await tx.$queryRaw<Array<{id:string;status:string}>>(Prisma.sql`SELECT "id","status" FROM "JournalEntry" WHERE "id"=${input.journalEntryId}::uuid AND "societyId"=${societyId}::uuid FOR UPDATE`); if(!j.length||j[0].status!=='POSTED') throw new ConflictException('Settlement requires a posted payment journal');
      await tx.$executeRaw(Prisma.sql`INSERT INTO "PayableSettlement" ("societyId","payableId","amountPaise","settlementDate","journalEntryId","idempotencyKey","reference","createdByUserId") VALUES (${societyId}::uuid,${payableId}::uuid,${input.amountPaise},${input.settlementDate}::date,${input.journalEntryId}::uuid,${input.idempotencyKey.trim()},${input.reference?.trim()||null},${userId}::uuid)`);
      const totals=await tx.$queryRaw<Array<{settled:bigint}>>(Prisma.sql`SELECT COALESCE(SUM("amountPaise"),0) AS settled FROM "PayableSettlement" WHERE "payableId"=${payableId}::uuid AND "societyId"=${societyId}::uuid`);
      const status=totals[0].settled===p[0].originalAmountPaise?'PAID':'PARTIALLY_PAID'; await tx.$executeRaw(Prisma.sql`UPDATE "SocietyPayable" SET "status"=${status}::"SocietyPayableStatus","updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${payableId}::uuid AND "societyId"=${societyId}::uuid`); return {payableId,status,settledPaise:totals[0].settled.toString()};
    }).catch(e=>this.rethrow(e,'Payable could not be settled'));
  }

  listBudgets(societyId:string){return this.prisma.$queryRaw(Prisma.sql`SELECT b."id",b."code",b."name",b."startsOn",b."endsOn",b."status",COALESCE(SUM(l."amountPaise"),0)::text AS "budgetPaise" FROM "BudgetPlan" b LEFT JOIN "BudgetLine" l ON l."budgetPlanId"=b."id" AND l."societyId"=b."societyId" WHERE b."societyId"=${societyId}::uuid GROUP BY b."id" ORDER BY b."startsOn" DESC`);}

  async createBudget(societyId:string,userId:string,input:CreateBudgetInput){if(input.startsOn>input.endsOn)throw new BadRequestException('Budget start must be before end');return this.prisma.$transaction(async tx=>{const b=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`INSERT INTO "BudgetPlan" ("societyId","code","name","startsOn","endsOn","createdByUserId") VALUES (${societyId}::uuid,${input.code.trim().toUpperCase()},${input.name.trim()},${input.startsOn}::date,${input.endsOn}::date,${userId}::uuid) RETURNING "id"`);for(const l of input.lines){if(l.amountPaise<0)throw new BadRequestException('Budget line amount cannot be negative');await tx.$executeRaw(Prisma.sql`INSERT INTO "BudgetLine" ("societyId","budgetPlanId","accountId","fundId","amountPaise","notes") VALUES (${societyId}::uuid,${b[0].id}::uuid,${l.accountId}::uuid,${l.fundId??null}::uuid,${l.amountPaise},${l.notes?.trim()||null})`);}return {id:b[0].id,status:'DRAFT'};}).catch(e=>this.rethrow(e,'Budget could not be created'));}
  async approveBudget(societyId:string,userId:string,id:string){return this.changeBudgetStatus(societyId,userId,id,'APPROVED');}
  async lockBudget(societyId:string,userId:string,id:string){return this.changeBudgetStatus(societyId,userId,id,'LOCKED');}
  private async changeBudgetStatus(societyId:string,userId:string,id:string,target:'APPROVED'|'LOCKED'){return this.prisma.$transaction(async tx=>{const rows=await tx.$queryRaw<Array<{status:string}>>(Prisma.sql`SELECT "status" FROM "BudgetPlan" WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid FOR UPDATE`);if(!rows.length)throw new NotFoundException('Budget not found');if(target==='APPROVED'&&rows[0].status!=='DRAFT')throw new ConflictException('Only draft budgets can be approved');if(target==='LOCKED'&&rows[0].status!=='APPROVED')throw new ConflictException('Only approved budgets can be locked');await tx.$executeRaw(Prisma.sql`UPDATE "BudgetPlan" SET "status"=${target}::"BudgetPlanStatus","approvedByUserId"=COALESCE("approvedByUserId",${userId}::uuid),"approvedAt"=COALESCE("approvedAt",CURRENT_TIMESTAMP),"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid`);return {id,status:target};});}

  budgetVsActual(societyId:string,budgetId:string){return this.prisma.$queryRaw(Prisma.sql`
    SELECT l."accountId",l."fundId",l."amountPaise"::text AS "budgetPaise",
      COALESCE(SUM(CASE WHEN je."status"='POSTED' THEN jl."debitPaise"-jl."creditPaise" ELSE 0 END),0)::text AS "actualPaise"
    FROM "BudgetPlan" b JOIN "BudgetLine" l ON l."budgetPlanId"=b."id" AND l."societyId"=b."societyId"
    LEFT JOIN "JournalLine" jl ON jl."societyId"=b."societyId" AND jl."accountId"=l."accountId" AND jl."fundId" IS NOT DISTINCT FROM l."fundId"
    LEFT JOIN "JournalEntry" je ON je."id"=jl."entryId" AND je."societyId"=jl."societyId" AND je."entryDate" BETWEEN b."startsOn" AND b."endsOn"
    WHERE b."id"=${budgetId}::uuid AND b."societyId"=${societyId}::uuid GROUP BY l."id" ORDER BY l."accountId"
  `);}
  fundUtilization(societyId:string){return this.prisma.$queryRaw(Prisma.sql`SELECT f."id",f."code",f."name",COALESCE(SUM(CASE WHEN je."status"='POSTED' THEN jl."debitPaise"-jl."creditPaise" ELSE 0 END),0)::text AS "netPaise" FROM "AccountingFund" f LEFT JOIN "JournalLine" jl ON jl."fundId"=f."id" AND jl."societyId"=f."societyId" LEFT JOIN "JournalEntry" je ON je."id"=jl."entryId" AND je."societyId"=jl."societyId" WHERE f."societyId"=${societyId}::uuid GROUP BY f."id" ORDER BY f."code"`);}

  async operationalReadiness(societyId:string){
    const rows=await this.prisma.$queryRaw<Array<{
      draftExpenses:number;approvedUnpostedExpenses:number;overduePayables:number;draftBudgets:number;
      unresolvedReconciliation:number;unsettledGatewayOperations:number;unlinkedPurchaseOrders:number;contractsExpiring30d:number;
    }>>(Prisma.sql`
      SELECT
        (SELECT COUNT(*)::int FROM "SocietyExpense" WHERE "societyId"=${societyId}::uuid AND "status"='DRAFT') AS "draftExpenses",
        (SELECT COUNT(*)::int FROM "SocietyExpense" WHERE "societyId"=${societyId}::uuid AND "status"='APPROVED') AS "approvedUnpostedExpenses",
        (SELECT COUNT(*)::int FROM "SocietyPayable" WHERE "societyId"=${societyId}::uuid AND "status" NOT IN ('PAID','VOID') AND "dueDate" IS NOT NULL AND "dueDate"<CURRENT_DATE) AS "overduePayables",
        (SELECT COUNT(*)::int FROM "BudgetPlan" WHERE "societyId"=${societyId}::uuid AND "status"='DRAFT') AS "draftBudgets",
        (SELECT COUNT(*)::int FROM "PaymentReconciliationCase" WHERE "societyId"=${societyId}::uuid AND "status"<>'RESOLVED') AS "unresolvedReconciliation",
        (SELECT COUNT(*)::int FROM "PaymentGatewayOperation" WHERE "societyId"=${societyId}::uuid AND "status"<>'SETTLED') AS "unsettledGatewayOperations",
        (SELECT COUNT(*)::int FROM "PurchaseOrder" po WHERE po."societyId"=${societyId}::uuid AND po."status"='ISSUED'
          AND NOT EXISTS (SELECT 1 FROM "ProcurementExpenseLink" l WHERE l."societyId"=po."societyId" AND l."purchaseOrderId"=po."id")) AS "unlinkedPurchaseOrders",
        (SELECT COUNT(*)::int FROM "SocietyVendorContract" WHERE "societyId"=${societyId}::uuid AND "status"='ACTIVE' AND "endsOn"<=CURRENT_DATE+INTERVAL '30 days') AS "contractsExpiring30d"
    `);
    const metrics=rows[0]??{draftExpenses:0,approvedUnpostedExpenses:0,overduePayables:0,draftBudgets:0,unresolvedReconciliation:0,unsettledGatewayOperations:0,unlinkedPurchaseOrders:0,contractsExpiring30d:0};
    const blockers:string[]=[];
    if(metrics.unresolvedReconciliation>0)blockers.push('RECONCILIATION_OPEN');
    if(metrics.unsettledGatewayOperations>0)blockers.push('GATEWAY_OPERATIONS_UNSETTLED');
    if(metrics.overduePayables>0)blockers.push('PAYABLES_OVERDUE');
    if(metrics.approvedUnpostedExpenses>0)blockers.push('EXPENSES_APPROVED_NOT_POSTED');
    if(metrics.unlinkedPurchaseOrders>0)blockers.push('PROCUREMENT_ACCOUNTING_HANDOFF_PENDING');
    if(metrics.contractsExpiring30d>0)blockers.push('VENDOR_CONTRACTS_EXPIRING');
    const nextActions:string[]=[];
    if(metrics.unresolvedReconciliation>0)nextActions.push('Review payment reconciliation evidence, including dispute, reversal and chargeback observations.');
    if(metrics.unsettledGatewayOperations>0)nextActions.push('Review requested gateway operations and retain provider execution behind the configured adapter.');
    if(metrics.overduePayables>0)nextActions.push('Review overdue payables and settle only against posted journal evidence.');
    if(metrics.approvedUnpostedExpenses>0)nextActions.push('Post approved expenses through the controlled accounting workflow.');
    if(metrics.unlinkedPurchaseOrders>0)nextActions.push('Complete the purchase-order to accounting-expense handoff.');
    if(metrics.contractsExpiring30d>0)nextActions.push('Review expiring vendor contracts or AMCs before their renewal notice window closes.');
    if(metrics.draftBudgets>0)nextActions.push('Review draft budgets before approval and lock.');
    if(nextActions.length===0)nextActions.push('No execution exception is visible; continue routine finance controls and period-close review.');
    const critical=metrics.unresolvedReconciliation+metrics.unsettledGatewayOperations+metrics.overduePayables;
    return {
      ...metrics,
      status:critical>0?'AT_RISK':blockers.length>0?'WATCH':'READY',
      blockers,nextActions,
      automaticDebitAvailable:false,
      providerExecution:'ADAPTER_CONTROLLED',
      boundary:'Deterministic current-state execution readiness from recorded finance, payment, procurement and contract evidence. This does not certify provider settlement, execute AutoPay mandates, or close accounting periods automatically.',
      generatedAt:new Date().toISOString(),
    };
  }

  async treasurerControlCentre(societyId:string){
    const [readiness,bankRows,cashRows,budgetRows,taxRows,refundRows]=await Promise.all([
      this.operationalReadiness(societyId),
      this.prisma.$queryRaw<Array<{unmatchedBank:number;unmatchedMovementPaise:string}>>(Prisma.sql`SELECT COUNT(*) FILTER (WHERE "status"='UNMATCHED')::int AS "unmatchedBank",COALESCE(SUM(CASE WHEN "status"='UNMATCHED' AND "direction"='CREDIT' THEN "amountPaise" WHEN "status"='UNMATCHED' THEN -"amountPaise" ELSE 0 END),0)::text AS "unmatchedMovementPaise" FROM "BankStatementTransaction" WHERE "societyId"=${societyId}::uuid`),
      this.prisma.$queryRaw<Array<{unappliedCount:number;unappliedPaise:string}>>(Prisma.sql`
        SELECT COUNT(*) FILTER (WHERE x."availablePaise">0)::int AS "unappliedCount",COALESCE(SUM(GREATEST(x."availablePaise",0)),0)::text AS "unappliedPaise"
        FROM (SELECT p."id",p."amountPaise"-COALESCE((SELECT SUM(a."amountPaise") FROM "ReceivableAllocation" a WHERE a."societyId"=p."societyId" AND a."paymentId"=p."id"),0)+COALESCE((SELECT SUM(r."amountPaise") FROM "ReceivableAllocationReversal" r JOIN "ReceivableAllocation" a ON a."id"=r."allocationId" AND a."societyId"=r."societyId" WHERE a."societyId"=p."societyId" AND a."paymentId"=p."id"),0)-COALESCE((SELECT SUM(rf."amountPaise") FROM "PaymentRefund" rf WHERE rf."societyId"=p."societyId" AND rf."paymentId"=p."id"),0) AS "availablePaise" FROM "Payment" p WHERE p."societyId"=${societyId}::uuid AND p."status"='CAPTURED') x
      `),
      this.prisma.$queryRaw<Array<{overrunLines:number;overrunPaise:string}>>(Prisma.sql`
        WITH actuals AS (SELECT l."id" AS "lineId",l."amountPaise" AS budget,COALESCE(SUM(CASE WHEN je."status"='POSTED' THEN jl."debitPaise"-jl."creditPaise" ELSE 0 END),0) AS actual FROM "BudgetPlan" b JOIN "BudgetLine" l ON l."budgetPlanId"=b."id" AND l."societyId"=b."societyId" LEFT JOIN "JournalLine" jl ON jl."societyId"=b."societyId" AND jl."accountId"=l."accountId" AND jl."fundId" IS NOT DISTINCT FROM l."fundId" LEFT JOIN "JournalEntry" je ON je."id"=jl."entryId" AND je."societyId"=jl."societyId" AND je."entryDate" BETWEEN b."startsOn" AND b."endsOn" WHERE b."societyId"=${societyId}::uuid AND b."status" IN ('APPROVED','LOCKED') GROUP BY l."id")
        SELECT COUNT(*) FILTER (WHERE actual>budget)::int AS "overrunLines",COALESCE(SUM(GREATEST(actual-budget,0)),0)::text AS "overrunPaise" FROM actuals
      `),
      this.prisma.$queryRaw<Array<{gstEnabled:boolean;tdsEnabled:boolean;documentsMissingTaxEvidence:number}>>(Prisma.sql`
        SELECT COALESCE(c."gstEnabled",FALSE) AS "gstEnabled",COALESCE(c."tdsEnabled",FALSE) AS "tdsEnabled",CASE WHEN COALESCE(c."gstEnabled",FALSE) OR COALESCE(c."tdsEnabled",FALSE) THEN (SELECT COUNT(*)::int FROM "SocietyExpense" e WHERE e."societyId"=${societyId}::uuid AND e."status" IN ('APPROVED','POSTED') AND NOT EXISTS (SELECT 1 FROM "FinanceTaxDocumentMetadata" tm WHERE tm."societyId"=e."societyId" AND tm."documentType"='EXPENSE' AND tm."documentId"=e."id")) ELSE 0 END AS "documentsMissingTaxEvidence" FROM (SELECT 1) seed LEFT JOIN "SocietyTaxConfiguration" c ON c."societyId"=${societyId}::uuid
      `),
      this.prisma.$queryRaw<Array<{refunds30d:number;refundedPaise30d:string}>>(Prisma.sql`SELECT COUNT(*)::int AS "refunds30d",COALESCE(SUM("amountPaise"),0)::text AS "refundedPaise30d" FROM "PaymentRefund" WHERE "societyId"=${societyId}::uuid AND "refundedAt">=CURRENT_TIMESTAMP-INTERVAL '30 days'`),
    ]);
    const bank=bankRows[0]??{unmatchedBank:0,unmatchedMovementPaise:'0'},cash=cashRows[0]??{unappliedCount:0,unappliedPaise:'0'},budget=budgetRows[0]??{overrunLines:0,overrunPaise:'0'},tax=taxRows[0]??{gstEnabled:false,tdsEnabled:false,documentsMissingTaxEvidence:0},refunds=refundRows[0]??{refunds30d:0,refundedPaise30d:'0'};
    const attention=readiness.blockers.length+bank.unmatchedBank+cash.unappliedCount+budget.overrunLines+tax.documentsMissingTaxEvidence;
    return {status:attention===0?'CLEAR':readiness.status==='AT_RISK'?'ACTION_REQUIRED':'ATTENTION',financeReadiness:readiness,bank,cash,budget,tax,refunds,nextActions:[...(bank.unmatchedBank?['Review deterministic bank-match suggestions before posting or matching.']:[]),...(cash.unappliedCount?['Allocate captured cash or document the exception before period close.']:[]),...(budget.overrunLines?['Review budget-versus-actual overruns with the Treasurer/Committee.']:[]),...(tax.documentsMissingTaxEvidence?['Complete GST/TDS metadata for approved or posted expenses where configured.']:[]),...readiness.nextActions].slice(0,10),automaticPosting:false,automaticMatching:false,boundary:'Treasurer control evidence is deterministic current-state aggregation. It does not post journals, match bank transactions, execute refunds, determine tax liability, or close periods automatically.',generatedAt:new Date().toISOString()};
  }

  async exportSnapshot(societyId:string){const [expenses,payables,budgets,funds]=await Promise.all([this.listExpenses(societyId),this.listPayables(societyId),this.listBudgets(societyId),this.fundUtilization(societyId)]);return {generatedAt:new Date().toISOString(),expenses,payables,budgets,funds};}

  private rethrow(error:unknown,fallback:string):never{if(error instanceof BadRequestException||error instanceof ConflictException||error instanceof NotFoundException)throw error;const m=error instanceof Error?error.message:'';if(m.includes('duplicate')||m.includes('unique'))throw new ConflictException('Finance record already exists');if(m.includes('foreign key'))throw new BadRequestException('Referenced finance resource does not belong to this society or does not exist');if(m.includes('immutable')||m.includes('over-settlement'))throw new ConflictException(m);throw new BadRequestException(fallback);}
}
