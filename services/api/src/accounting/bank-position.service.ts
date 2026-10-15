import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BankPositionService {
  constructor(private readonly prisma:PrismaService) {}

  async position(societyId:string,bankAccountId:string,asOf:string){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||Number.isNaN(Date.parse(`${asOf}T00:00:00.000Z`))) throw new BadRequestException('asOf must be a valid YYYY-MM-DD date');
    const accounts=await this.prisma.$queryRaw<Array<{ledgerAccountId:string;openingBalancePaise:bigint}>>(Prisma.sql`
      SELECT "ledgerAccountId","openingBalancePaise" FROM "SocietyBankAccount"
      WHERE "id"=${bankAccountId}::uuid AND "societyId"=${societyId}::uuid AND "active"=true LIMIT 1
    `);
    if(!accounts.length) throw new NotFoundException('Bank account not found');
    const account=accounts[0];
    const statement=await this.prisma.$queryRaw<Array<{movement:bigint;unmatchedCount:bigint}>>(Prisma.sql`
      SELECT COALESCE(SUM(CASE WHEN "direction"='CREDIT' THEN "amountPaise" ELSE -"amountPaise" END),0) AS movement,
             COUNT(*) FILTER (WHERE "status"='UNMATCHED') AS "unmatchedCount"
      FROM "BankStatementTransaction"
      WHERE "societyId"=${societyId}::uuid AND "bankAccountId"=${bankAccountId}::uuid AND "transactionDate"<=${asOf}::date
    `);
    const ledger=await this.prisma.$queryRaw<Array<{balance:bigint}>>(Prisma.sql`
      SELECT COALESCE(SUM(jl."debitPaise"-jl."creditPaise"),0) AS balance
      FROM "JournalLine" jl JOIN "JournalEntry" je ON je."id"=jl."entryId" AND je."societyId"=jl."societyId"
      WHERE jl."societyId"=${societyId}::uuid AND jl."accountId"=${account.ledgerAccountId}::uuid
        AND je."entryDate"<=${asOf}::date AND je."status" IN ('POSTED','REVERSED')
    `);
    const statementClosing=account.openingBalancePaise+(statement[0]?.movement??0n);
    const ledgerClosing=ledger[0]?.balance??0n;
    return {bankAccountId,asOf,openingBalancePaise:account.openingBalancePaise.toString(),statementMovementPaise:(statement[0]?.movement??0n).toString(),statementClosingPaise:statementClosing.toString(),ledgerClosingPaise:ledgerClosing.toString(),differencePaise:(statementClosing-ledgerClosing).toString(),unmatchedCount:Number(statement[0]?.unmatchedCount??0n),balanced:statementClosing===ledgerClosing};
  }
}
