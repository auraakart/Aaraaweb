import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { BillingController, PaymentWebhookController } from './billing.controller';
import { BillingService } from './billing.service';
import { StatementFeatureGuard } from './statement-feature.guard';

@Module({
  imports: [EntitlementsModule],
  controllers: [BillingController, PaymentWebhookController],
  providers: [BillingService, PrismaService, StatementFeatureGuard],
})
export class BillingModule {}
