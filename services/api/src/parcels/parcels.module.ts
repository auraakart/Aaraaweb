import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ParcelRecipientsService } from './parcel-recipients.service';
import { ParcelReminderService } from './parcel-reminder.service';
import { ParcelsController } from './parcels.controller';
import { ParcelsService } from './parcels.service';

@Module({
  controllers: [ParcelsController],
  providers: [PrismaService, ParcelsService, ParcelReminderService, ParcelRecipientsService],
  exports: [ParcelsService, ParcelReminderService, ParcelRecipientsService],
})
export class ParcelsModule {}
