import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { ReceivablesController } from './receivables.controller';
import { ReceivablesService } from './receivables.service';

@Module({
  imports: [EntitlementsModule],
  controllers: [AccountingController, ReceivablesController],
  providers: [AccountingService, ReceivablesService, PrismaService],
  exports: [AccountingService, ReceivablesService],
})
export class AccountingModule {}
