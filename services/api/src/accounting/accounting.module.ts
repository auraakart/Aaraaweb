import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { FinanceOperationsController } from './finance-operations.controller';
import { FinanceOperationsService } from './finance-operations.service';
import { LateFeesController } from './late-fees.controller';
import { LateFeesService } from './late-fees.service';
import { PaymentExceptionsController } from './payment-exceptions.controller';
import { PaymentExceptionsService } from './payment-exceptions.service';
import { PaymentReconciliationController } from './payment-reconciliation.controller';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { ReceivablesController } from './receivables.controller';
import { ReceivablesService } from './receivables.service';
import { SettlementController } from './settlement.controller';
import { SettlementService } from './settlement.service';

@Module({
  imports: [EntitlementsModule],
  controllers: [AccountingController, ReceivablesController, SettlementController, LateFeesController, FinanceOperationsController, PaymentExceptionsController, PaymentReconciliationController],
  providers: [AccountingService, ReceivablesService, SettlementService, LateFeesService, FinanceOperationsService, PaymentExceptionsService, PaymentReconciliationService, PrismaService],
  exports: [AccountingService, ReceivablesService, SettlementService, LateFeesService, FinanceOperationsService, PaymentExceptionsService, PaymentReconciliationService],
})
export class AccountingModule {}
