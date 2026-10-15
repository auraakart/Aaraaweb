import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UtilitiesController } from './utilities.controller';
import { UtilitiesService } from './utilities.service';
import { UtilityChargesController } from './utility-charges.controller';
import { UtilityChargesService } from './utility-charges.service';
import { UtilityInvoicesController } from './utility-invoices.controller';
import { UtilityInvoicesService } from './utility-invoices.service';
import { UtilityResidentController } from './utility-resident.controller';
import { UtilityResidentService } from './utility-resident.service';
import { UtilityReadingImportController } from './utility-reading-import.controller';
import { UtilityReadingImportService } from './utility-reading-import.service';
import { UtilityIntegrationIngestionController, UtilityIntegrationManagementController } from './utility-integrations.controller';
import { UtilityIntegrationsService } from './utility-integrations.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    UtilitiesController,
    UtilityChargesController,
    UtilityInvoicesController,
    UtilityResidentController,
    UtilityReadingImportController,
    UtilityIntegrationManagementController,
    UtilityIntegrationIngestionController,
  ],
  providers: [
    UtilitiesService,
    UtilityChargesService,
    UtilityInvoicesService,
    UtilityResidentService,
    UtilityReadingImportService,
    UtilityIntegrationsService,
  ],
})
export class UtilitiesModule {}
