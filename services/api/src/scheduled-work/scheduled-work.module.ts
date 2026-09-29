import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ObjectStorageModule } from '../storage/object-storage.module';
import { AmenitiesModule } from '../amenities/amenities.module';
import { ObjectStorageCleanupService } from './object-storage-cleanup.service';
import { ScheduledWorkService } from './scheduled-work.service';

@Module({
  imports: [PrismaModule, ObjectStorageModule, AmenitiesModule],
  providers: [ScheduledWorkService, ObjectStorageCleanupService],
  exports: [ScheduledWorkService, ObjectStorageCleanupService],
})
export class ScheduledWorkModule {}
