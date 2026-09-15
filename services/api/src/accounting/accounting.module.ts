import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingController } from './accounting.controller';
import { AccountingConnectorDeliveryController } from './accounting-connector-delivery.controller';
import { AccountingConnectorDeliveryRunner } from './accounting-connector-delivery.runner';
import { AccountingConnectorDeliveryService } from './accounting-connector-delivery.service';
import { AccountingExportController } from './accounting-export.controller';
import { AccountingExportRunner } from './accounting-export.runner';
import { AccountingExportService } from './accounting-export.service';
import { AccountingService } from './accounting.service';
import { ConfiguredHttpAccountingConnectorAdapter } from './configured-http-accounting-connector.adapter';
import { ConfiguredHttpPaymentGatewayAdapter } from './configured-http-payment-gateway.adapter';
import { FinanceOperationsController } from './finance-operations.controller';
import { FinanceOperationsService } from './finance-operations.service';
import { LateFeesController } from './late-fees.controller';
import { LateFeesService } from './late-fees.service';
import { PaymentExceptionsController } from './payment-exceptions.controller';
import { PaymentExceptionsService } from './payment-exceptions.service';
import { PaymentReconciliationObservabilityController } from './payment-reconciliation-observability.controller';
import { PaymentReconciliationObservabilityService } from './payment-reconciliation-observability.service';
import { PaymentReconciliationController } from './payment-reconciliation.controller';
import { PaymentReconciliationRunner } from './payment-reconciliation.runner';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { ReceivablesController } from './receivables.controller';
import { ReceivablesService } from './receivables.service';
import { SettlementController } from './settlement.controller';
import { SettlementService } from './settlement.service';

@Module({
  imports: [EntitlementsModule],
  controllers: [AccountingController, AccountingExportController, AccountingConnectorDeliveryController, ReceivablesController, SettlementController, LateFeesController, FinanceOperationsController, PaymentExceptionsController, PaymentReconciliationController, PaymentReconciliationObservabilityController],
  providers: [AccountingService, AccountingExportService, AccountingExportRunner, ConfiguredHttpAccountingConnectorAdapter, AccountingConnectorDeliveryRunner, AccountingConnectorDeliveryService, ReceivablesService, SettlementService, LateFeesService, FinanceOperationsService, PaymentExceptionsService, PaymentReconciliationService, PaymentReconciliationObservabilityService, ConfiguredHttpPaymentGatewayAdapter, PaymentReconciliationRunner, PrismaService],
  exports: [AccountingService, AccountingExportService, ConfiguredHttpAccountingConnectorAdapter, AccountingConnectorDeliveryService, ReceivablesService, SettlementService, LateFeesService, FinanceOperationsService, PaymentExceptionsService, PaymentReconciliationService, PaymentReconciliationObservabilityService],
})
export class AccountingModule {}
