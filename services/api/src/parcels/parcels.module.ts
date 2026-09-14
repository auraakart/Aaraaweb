import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ParcelReminderService } from './parcel-reminder.service';
import { ParcelsController } from './parcels.controller';
import { ParcelsService } from './parcels.service';

@Module({
  controllers: [ParcelsController],
  providers: [PrismaService, ParcelsService, ParcelReminderService],
  exports: [ParcelsService, ParcelReminderService],
})
export class ParcelsModule {}
