import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { LateFeesController } from './late-fees.controller';
import { LateFeesService } from './late-fees.service';
import { ReceivablesController } from './receivables.controller';
import { ReceivablesService } from './receivables.service';
import { SettlementController } from './settlement.controller';
import { SettlementService } from './settlement.service';

@Module({
  imports: [EntitlementsModule],
  controllers: [AccountingController, ReceivablesController, SettlementController, LateFeesController],
  providers: [AccountingService, ReceivablesService, SettlementService, LateFeesService, PrismaService],
  exports: [AccountingService, ReceivablesService, SettlementService, LateFeesService],
})
export class AccountingModule {}
