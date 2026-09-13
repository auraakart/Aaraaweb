import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProcurementCommercialController } from './procurement-commercial.controller';
import { ProcurementCommercialService } from './procurement-commercial.service';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';

@Module({
  controllers: [VendorsController, ProcurementCommercialController],
  providers: [PrismaService, VendorsService, ProcurementCommercialService],
  exports: [VendorsService, ProcurementCommercialService],
})
export class VendorsModule {}
