import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { ReceivablesController } from './receivables.controller';
import { ReceivablesService } from './receivables.service';
import { SettlementController } from './settlement.controller';
import { SettlementService } from './settlement.service';

@Module({
  imports: [EntitlementsModule],
  controllers: [AccountingController, ReceivablesController, SettlementController],
  providers: [AccountingService, ReceivablesService, SettlementService, PrismaService],
  exports: [AccountingService, ReceivablesService, SettlementService],
})
export class AccountingModule {}
