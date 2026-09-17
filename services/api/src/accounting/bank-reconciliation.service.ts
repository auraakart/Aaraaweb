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
    if(input.amountPaise<=0) throw new BadRequestException('Bank transaction amount must be positive');
    const account=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "SocietyBankAccount" WHERE "id"=${input.bankAccountId}::uuid AND "societyId"=${societyId}::uuid AND "active"=true LIMIT 1`);
    if(!account.length) throw new BadRequestException('Bank account is not available for this society');
    try {
      const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        INSERT INTO "BankStatementTransaction" ("societyId","bankAccountId","externalKey","transactionDate","valueDate","direction","amountPaise","reference","description","importedByUserId")
        VALUES (${societyId}::uuid,${input.bankAccountId}::uuid,${input.externalKey.trim()},${input.transactionDate}::date,${input.valueDate??null}::date,${input.direction}::"BankTransactionDirection",${input.amountPaise},${input.reference?.trim()||null},${input.description?.trim()||null},${userId}::uuid)
        ON CONFLICT ("bankAccountId","externalKey") DO NOTHING
        RETURNING "id","bankAccountId","externalKey","transactionDate","valueDate","direction"::text AS "direction","amountPaise"::text AS "amountPaise","status"::text AS "status"
      `);
      if(rows.length) return rows[0];
      const existing=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        SELECT "id","bankAccountId","externalKey","transactionDate","valueDate","direction"::text AS "direction","amountPaise"::text AS "amountPaise","status"::text AS "status"
        FROM "BankStatementTransaction" WHERE "bankAccountId"=${input.bankAccountId}::uuid AND "externalKey"=${input.externalKey.trim()} LIMIT 1
      `);
      return existing[0];
    } catch(error) { this.rethrow(error,'Bank transaction could not be imported'); }
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

  private rethrow(error:unknown,fallback:string):never {
    if(error instanceof BadRequestException||error instanceof ConflictException||error instanceof NotFoundException) throw error;
    const code=typeof error==='object'&&error!==null&&'code' in error?String((error as {code?:unknown}).code):'';
    if(code==='23505') throw new ConflictException(fallback);
    if(code==='23503'||code==='22P02') throw new BadRequestException(fallback);
    throw error;
  }
}
