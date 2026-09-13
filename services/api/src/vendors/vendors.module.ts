import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';

@Module({
  controllers: [VendorsController],
  providers: [PrismaService, VendorsService],
  exports: [VendorsService],
})
export class VendorsModule {}
