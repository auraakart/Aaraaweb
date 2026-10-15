import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProcurementAccountingLinkController } from './procurement-accounting-link.controller';
import { ProcurementAccountingLinkService } from './procurement-accounting-link.service';
import { ProcurementCommercialController } from './procurement-commercial.controller';
import { ProcurementCommercialService } from './procurement-commercial.service';
import { VendorContractsController } from './vendor-contracts.controller';
import { VendorContractsService } from './vendor-contracts.service';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';

@Module({
  controllers: [VendorsController, ProcurementCommercialController, ProcurementAccountingLinkController, VendorContractsController],
  providers: [PrismaService, VendorsService, ProcurementCommercialService, ProcurementAccountingLinkService, VendorContractsService],
  exports: [VendorsService, ProcurementCommercialService, ProcurementAccountingLinkService, VendorContractsService],
})
export class VendorsModule {}
