import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UtilitiesController } from './utilities.controller';
import { UtilitiesService } from './utilities.service';
import { UtilityChargesController } from './utility-charges.controller';
import { UtilityChargesService } from './utility-charges.service';
import { UtilityInvoicesController } from './utility-invoices.controller';
import { UtilityInvoicesService } from './utility-invoices.service';

@Module({
  imports: [PrismaModule],
  controllers: [UtilitiesController, UtilityChargesController, UtilityInvoicesController],
  providers: [UtilitiesService, UtilityChargesService, UtilityInvoicesService],
})
export class UtilitiesModule {}
