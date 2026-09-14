import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ParcelsController } from './parcels.controller';
import { ParcelsService } from './parcels.service';

@Module({
  controllers: [ParcelsController],
  providers: [PrismaService, ParcelsService],
  exports: [ParcelsService],
})
export class ParcelsModule {}
