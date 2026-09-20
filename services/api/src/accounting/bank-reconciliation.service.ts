import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type CreateBankAccountInput = {
  code:string; bankName:string; accountName:string; maskedAccountNumber:string; ifsc?:string; ledgerAccountId:string; openingBalancePaise?:number;
};
type ImportBankTransactionInput = {
  bankAccountId:string; externalKey:string; transactionDate:string; valueDate?:string; direction:'CREDIT'|'DEBIT'; amountPaise:number; reference?:string; description?:string;
};
type MatchInput = { journalEntryId:string; note?:string };
type BankStatementRowInput = Omit<ImportBankTransactionInput,'bankAccountId'>;
type ExistingBankTransaction = { externalKey:string; transactionDate:Date|string; direction:string; amountPaise:bigint|number|string };

@Injectable()
export class BankReconciliationService {
  constructor(private readonly prisma:PrismaService) {}

  listAccounts(societyId:string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT b."id",b."code",b."bankName",b."accountName",b."maskedAccountNumber",b."ifsc",b."ledgerAccountId",
             b."openingBalancePaise"::text AS "openingBalancePaise",b."active",la."code" AS "ledgerCode",la."name" AS "ledgerName"
      FROM "SocietyBankAccount" b
      JOIN "LedgerAccount" la ON la."id"=b."ledgerAccountId" AND la."societyId"=b."societyId"
      WHERE b."societyId"=${societyId}::uuid ORDER BY b."code"
    `);
  }

  async createAccount(societyId:string,input:CreateBankAccountInput) {
    if((input.openingBalancePaise??0)<0) throw new BadRequestException('Opening bank balance cannot be negative');
    const ledger=await this.prisma.$queryRaw<Array<{id:string;type:string}>>(Prisma.sql`
      SELECT "id","type"::text AS "type" FROM "LedgerAccount"
      WHERE "id"=${input.ledgerAccountId}::uuid AND "societyId"=${societyId}::uuid AND "active"=true LIMIT 1
    `);
    if(!ledger.length) throw new BadRequestException('Bank ledger account is not available for this society');
    if(ledger[0].type!=='ASSET') throw new BadRequestException('Bank ledger account must be an ASSET account');
    try {
      const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        INSERT INTO "SocietyBankAccount" ("societyId","code","bankName","accountName","maskedAccountNumber","ifsc","ledgerAccountId","openingBalancePaise")
        VALUES (${societyId}::uuid,${input.code.trim().toUpperCase()},${input.bankName.trim()},${input.accountName.trim()},${input.maskedAccountNumber.trim()},${input.ifsc?.trim().toUpperCase()||null},${input.ledgerAccountId}::uuid,${input.openingBalancePaise??0})
        RETURNING "id","code","bankName","accountName","maskedAccountNumber","ifsc","ledgerAccountId","openingBalancePaise"::text AS "openingBalancePaise","active"
      `);
      return rows[0];
    } catch(error) { this.rethrow(error,'Bank account could not be created'); }
  }

  listTransactions(societyId:string,bankAccountId?:string,status?:string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT t."id",t."bankAccountId",b."code" AS "bankCode",t."externalKey",t."transactionDate",t."valueDate",t."direction"::text AS "direction",
             t."amountPaise"::text AS "amountPaise",t."reference",t."description",t."status"::text AS "status",m."journalEntryId",je."entryNumber",m."matchedAt",m."note"
      FROM "BankStatementTransaction" t
      JOIN "SocietyBankAccount" b ON b."id"=t."bankAccountId" AND b."societyId"=t."societyId"
      LEFT JOIN "BankReconciliationMatch" m ON m."bankTransactionId"=t."id" AND m."societyId"=t."societyId"
      LEFT JOIN "JournalEntry" je ON je."id"=m."journalEntryId" AND je."societyId"=m."societyId"
      WHERE t."societyId"=${societyId}::uuid
        AND (${bankAccountId??null}::uuid IS NULL OR t."bankAccountId"=${bankAccountId??null}::uuid)
        AND (${status??null}::text IS NULL OR t."status"::text=${status??null})
      ORDER BY t."transactionDate" DESC,t."importedAt" DESC LIMIT 1000
    `);
  }

  async importTransaction(societyId:string,userId:string,input:ImportBankTransactionInput) {
    const externalKey=input.externalKey.trim();
    if(!externalKey) throw new BadRequestException('Bank transaction external key is required');
    if(input.amountPaise<=0) throw new BadRequestException('Bank transaction amount must be positive');
    const account=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "SocietyBankAccount" WHERE "id"=${input.bankAccountId}::uuid AND "societyId"=${societyId}::uuid AND "active"=true LIMIT 1`);
    if(!account.length) throw new BadRequestException('Bank account is not available for this society');
    try {
      const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        INSERT INTO "BankStatementTransaction" ("societyId","bankAccountId","externalKey","transactionDate","valueDate","direction","amountPaise","reference","description","importedByUserId")
        VALUES (${societyId}::uuid,${input.bankAccountId}::uuid,${externalKey},${input.transactionDate}::date,${input.valueDate??null}::date,${input.direction}::"BankTransactionDirection",${input.amountPaise},${input.reference?.trim()||null},${input.description?.trim()||null},${userId}::uuid)
        ON CONFLICT ("bankAccountId","externalKey") DO NOTHING
        RETURNING "id","bankAccountId","externalKey","transactionDate","valueDate","direction"::text AS "direction","amountPaise"::text AS "amountPaise","status"::text AS "status"
      `);
      if(rows.length) return rows[0];
      const existing=await this.prisma.$queryRaw<Array<Record<string,unknown>&ExistingBankTransaction>>(Prisma.sql`
        SELECT "id","bankAccountId","externalKey","transactionDate","valueDate","direction"::text AS "direction","amountPaise"::text AS "amountPaise","status"::text AS "status"
        FROM "BankStatementTransaction" WHERE "societyId"=${societyId}::uuid AND "bankAccountId"=${input.bankAccountId}::uuid AND "externalKey"=${externalKey} LIMIT 1
      `);
      if(!existing[0]) throw new ConflictException('Bank transaction external key already exists');
      if(!this.sameImportedTransaction(existing[0],input)) throw new ConflictException('Bank transaction external key conflicts with previously imported data');
      return existing[0];
    } catch(error) { this.rethrow(error,'Bank transaction could not be imported'); }
  }

  async previewImport(societyId:string,bankAccountId:string,rows:BankStatementRowInput[]) {
    if(rows.length<1||rows.length>500) throw new BadRequestException('Bank statement preview requires between 1 and 500 rows');
    const account=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "SocietyBankAccount" WHERE "id"=${bankAccountId}::uuid AND "societyId"=${societyId}::uuid AND "active"=true LIMIT 1`);
    if(!account.length) throw new BadRequestException('Bank account is not available for this society');
    const normalized=rows.map((row,index)=>({index,row:{...row,externalKey:row.externalKey.trim()}}));
    if(normalized.some(item=>!item.row.externalKey)) throw new BadRequestException('Every bank statement row requires an external key');
    const keys=[...new Set(normalized.map(item=>item.row.externalKey))];
    const existing=await this.prisma.$queryRaw<ExistingBankTransaction[]>(Prisma.sql`
      SELECT "externalKey","transactionDate","direction"::text AS "direction","amountPaise"
      FROM "BankStatementTransaction"
      WHERE "societyId"=${societyId}::uuid AND "bankAccountId"=${bankAccountId}::uuid
        AND "externalKey" IN (${Prisma.join(keys)})
    `);
    const existingByKey=new Map(existing.map(item=>[item.externalKey,item]));
    const seen=new Set<string>();
    const items=normalized.map(({index,row})=>{
      let status:'NEW'|'DUPLICATE_IN_BATCH'|'ALREADY_IMPORTED'|'CONFLICT'='NEW';
      if(seen.has(row.externalKey)) status='DUPLICATE_IN_BATCH';
      else {
        seen.add(row.externalKey);
        const prior=existingByKey.get(row.externalKey);
        if(prior) status=this.sameImportedTransaction(prior,{...row,bankAccountId})?'ALREADY_IMPORTED':'CONFLICT';
      }
      return {index,externalKey:row.externalKey,transactionDate:row.transactionDate,direction:row.direction,amountPaise:row.amountPaise,status};
    });
    return {
      bankAccountId,totalCount:items.length,
      newCount:items.filter(item=>item.status==='NEW').length,
      alreadyImportedCount:items.filter(item=>item.status==='ALREADY_IMPORTED').length,
      duplicateInBatchCount:items.filter(item=>item.status==='DUPLICATE_IN_BATCH').length,
      conflictCount:items.filter(item=>item.status==='CONFLICT').length,
      canCommit:items.every(item=>item.status==='NEW'||item.status==='ALREADY_IMPORTED'),
      items,
    };
  }

  async match(societyId:string,userId:string,transactionId:string,input:MatchInput) {
    return this.prisma.$transaction(async tx=>{
      const txRows=await tx.$queryRaw<Array<{id:string;status:string;direction:string;amountPaise:bigint;ledgerAccountId:string}>>(Prisma.sql`
        SELECT t."id",t."status"::text AS "status",t."direction"::text AS "direction",t."amountPaise",b."ledgerAccountId"
        FROM "BankStatementTransaction" t JOIN "SocietyBankAccount" b ON b."id"=t."bankAccountId" AND b."societyId"=t."societyId"
        WHERE t."id"=${transactionId}::uuid AND t."societyId"=${societyId}::uuid FOR UPDATE OF t
      `);
      const bankTx=txRows[0];
      if(!bankTx) throw new NotFoundException('Bank transaction not found');
      if(bankTx.status!=='UNMATCHED') throw new ConflictException('Only unmatched bank transactions can be reconciled');

      const headers=await tx.$queryRaw<Array<{id:string;status:string}>>(Prisma.sql`
        SELECT "id","status"::text AS "status" FROM "JournalEntry"
        WHERE "id"=${input.journalEntryId}::uuid AND "societyId"=${societyId}::uuid FOR UPDATE
      `);
      if(!headers.length || !['POSTED','REVERSED'].includes(headers[0].status)) throw new BadRequestException('Reconciliation requires a posted journal entry');
      const deltas=await tx.$queryRaw<Array<{bankDelta:bigint}>>(Prisma.sql`
        SELECT COALESCE(SUM("debitPaise"-"creditPaise"),0) AS "bankDelta"
        FROM "JournalLine" WHERE "entryId"=${input.journalEntryId}::uuid AND "societyId"=${societyId}::uuid AND "accountId"=${bankTx.ledgerAccountId}::uuid
      `);
      const expected=bankTx.direction==='CREDIT'?bankTx.amountPaise:-bankTx.amountPaise;
      if((deltas[0]?.bankDelta??0n)!==expected) throw new ConflictException('Journal bank movement does not match statement amount and direction');

      const already=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "BankReconciliationMatch" WHERE "societyId"=${societyId}::uuid AND "journalEntryId"=${input.journalEntryId}::uuid LIMIT 1`);
      if(already.length) throw new ConflictException('Journal entry is already reconciled to another bank transaction');

      const match=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
        INSERT INTO "BankReconciliationMatch" ("societyId","bankTransactionId","journalEntryId","matchedByUserId","note")
        VALUES (${societyId}::uuid,${transactionId}::uuid,${input.journalEntryId}::uuid,${userId}::uuid,${input.note?.trim()||null}) RETURNING "id"
      `);
      await tx.$executeRaw(Prisma.sql`UPDATE "BankStatementTransaction" SET "status"='MATCHED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${transactionId}::uuid AND "societyId"=${societyId}::uuid`);
      return {transactionId,journalEntryId:input.journalEntryId,matchId:match[0].id,status:'MATCHED'};
    }).catch(error=>this.rethrow(error,'Bank transaction could not be reconciled'));
  }

  async unmatch(societyId:string,transactionId:string) {
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<Array<{id:string;status:string}>>(Prisma.sql`SELECT "id","status"::text AS "status" FROM "BankStatementTransaction" WHERE "id"=${transactionId}::uuid AND "societyId"=${societyId}::uuid FOR UPDATE`);
      if(!rows.length) throw new NotFoundException('Bank transaction not found');
      if(rows[0].status!=='MATCHED') throw new ConflictException('Only matched transactions can be unreconciled');
      await tx.$executeRaw(Prisma.sql`DELETE FROM "BankReconciliationMatch" WHERE "bankTransactionId"=${transactionId}::uuid AND "societyId"=${societyId}::uuid`);
      await tx.$executeRaw(Prisma.sql`UPDATE "BankStatementTransaction" SET "status"='UNMATCHED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${transactionId}::uuid AND "societyId"=${societyId}::uuid`);
      return {transactionId,status:'UNMATCHED'};
    }).catch(error=>this.rethrow(error,'Bank transaction could not be unreconciled'));
  }

  async ignore(societyId:string,transactionId:string) {
    const count=await this.prisma.$executeRaw(Prisma.sql`UPDATE "BankStatementTransaction" SET "status"='IGNORED',"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${transactionId}::uuid AND "societyId"=${societyId}::uuid AND "status"='UNMATCHED'`);
    if(count!==1) throw new ConflictException('Only unmatched transactions can be ignored');
    return {transactionId,status:'IGNORED'};
  }

  summary(societyId:string,bankAccountId?:string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT COUNT(*)::int AS "transactionCount",
             COUNT(*) FILTER (WHERE t."status"='UNMATCHED')::int AS "unmatchedCount",
             COUNT(*) FILTER (WHERE t."status"='MATCHED')::int AS "matchedCount",
             COALESCE(SUM(CASE WHEN t."direction"='CREDIT' THEN t."amountPaise" ELSE -t."amountPaise" END),0)::text AS "statementMovementPaise",
             COALESCE(SUM(CASE WHEN t."status"='MATCHED' AND t."direction"='CREDIT' THEN t."amountPaise" WHEN t."status"='MATCHED' THEN -t."amountPaise" ELSE 0 END),0)::text AS "reconciledMovementPaise"
      FROM "BankStatementTransaction" t WHERE t."societyId"=${societyId}::uuid
        AND (${bankAccountId??null}::uuid IS NULL OR t."bankAccountId"=${bankAccountId??null}::uuid)
    `);
  }

  async suggestions(societyId:string,transactionId:string) {
    const transactions=await this.prisma.$queryRaw<Array<{
      id:string;status:string;transactionDate:Date;direction:string;amountPaise:bigint;ledgerAccountId:string;bankCode:string;
    }>>(Prisma.sql`
      SELECT t."id",t."status"::text AS "status",t."transactionDate",t."direction"::text AS "direction",
             t."amountPaise",b."ledgerAccountId",b."code" AS "bankCode"
      FROM "BankStatementTransaction" t
      JOIN "SocietyBankAccount" b ON b."id"=t."bankAccountId" AND b."societyId"=t."societyId"
      WHERE t."id"=${transactionId}::uuid AND t."societyId"=${societyId}::uuid
      LIMIT 1
    `);
    const transaction=transactions[0];
    if(!transaction) throw new NotFoundException('Bank transaction not found');
    if(transaction.status!=='UNMATCHED') throw new ConflictException('Suggestions are available only for unmatched bank transactions');
    const expected=transaction.direction==='CREDIT'?transaction.amountPaise:-transaction.amountPaise;
    const candidates=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      SELECT je."id" AS "journalEntryId",je."entryNumber",je."entryDate",je."description",je."externalReference",
             SUM(jl."debitPaise"-jl."creditPaise")::text AS "bankMovementPaise",
             ABS(je."entryDate"-${transaction.transactionDate}::date)::int AS "dateDistanceDays"
      FROM "JournalEntry" je
      JOIN "JournalLine" jl ON jl."entryId"=je."id" AND jl."societyId"=je."societyId" AND jl."accountId"=${transaction.ledgerAccountId}::uuid
      WHERE je."societyId"=${societyId}::uuid
        AND je."status" IN ('POSTED','REVERSED')
        AND je."entryDate" BETWEEN (${transaction.transactionDate}::date-INTERVAL '7 days') AND (${transaction.transactionDate}::date+INTERVAL '7 days')
        AND NOT EXISTS (
          SELECT 1 FROM "BankReconciliationMatch" m
          WHERE m."societyId"=${societyId}::uuid AND m."journalEntryId"=je."id"
        )
      GROUP BY je."id",je."entryNumber",je."entryDate",je."description",je."externalReference"
      HAVING SUM(jl."debitPaise"-jl."creditPaise")=${expected}
      ORDER BY "dateDistanceDays",je."entryNumber"
      LIMIT 12
    `);
    return {
      transaction:{id:transaction.id,bankCode:transaction.bankCode,transactionDate:transaction.transactionDate,direction:transaction.direction,amountPaise:transaction.amountPaise.toString()},
      candidates,
      autoMatched:false,
    };
  }

  async review(societyId:string,bankAccountId?:string) {
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
      SELECT COUNT(*)::int AS "transactionCount",
             COUNT(*) FILTER (WHERE t."status"='MATCHED')::int AS "matchedCount",
             COUNT(*) FILTER (WHERE t."status"='UNMATCHED')::int AS "unmatchedCount",
             COUNT(*) FILTER (WHERE t."status"='IGNORED')::int AS "ignoredCount",
             COUNT(*) FILTER (WHERE t."status"='UNMATCHED' AND t."transactionDate"<CURRENT_DATE-7)::int AS "staleUnmatchedCount",
             COALESCE(SUM(t."amountPaise") FILTER (WHERE t."status"='UNMATCHED'),0)::text AS "unmatchedValuePaise",
             CASE
               WHEN COUNT(*) FILTER (WHERE t."status" IN ('MATCHED','UNMATCHED'))=0 THEN 0
               ELSE ROUND(
                 100.0*COUNT(*) FILTER (WHERE t."status"='MATCHED')/
                 COUNT(*) FILTER (WHERE t."status" IN ('MATCHED','UNMATCHED')),1
               )
             END::float AS "matchRatePct"
      FROM "BankStatementTransaction" t
      WHERE t."societyId"=${societyId}::uuid
        AND (${bankAccountId??null}::uuid IS NULL OR t."bankAccountId"=${bankAccountId??null}::uuid)
    `);
    return rows[0]??{transactionCount:0,matchedCount:0,unmatchedCount:0,ignoredCount:0,staleUnmatchedCount:0,unmatchedValuePaise:'0',matchRatePct:0};
  }

  private sameImportedTransaction(existing:ExistingBankTransaction,input:ImportBankTransactionInput) {
    const existingDate=existing.transactionDate instanceof Date?existing.transactionDate.toISOString().slice(0,10):String(existing.transactionDate).slice(0,10);
    return existing.externalKey===input.externalKey.trim()
      &&existingDate===input.transactionDate.slice(0,10)
      &&existing.direction===input.direction
      &&Number(existing.amountPaise)===input.amountPaise;
  }

  private rethrow(error:unknown,fallback:string):never {
    if(error instanceof BadRequestException||error instanceof ConflictException||error instanceof NotFoundException) throw error;
    const code=typeof error==='object'&&error!==null&&'code' in error?String((error as {code?:unknown}).code):'';
    if(code==='23505') throw new ConflictException(fallback);
    if(code==='23503'||code==='22P02') throw new BadRequestException(fallback);
    throw error;
  }
}
