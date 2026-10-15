import { Module } from '@nestjs/common';
import { createMediaSafetyScannerFromEnv } from '../services-marketplace/clamav-media-safety-scanner.adapter';
import { MEDIA_SAFETY_SCANNER } from '../services-marketplace/media-safety-scanner.port';
import { OBJECT_STORAGE, ObjectStoragePort } from '../services-marketplace/object-storage.port';
import { ObjectStorageModule } from './object-storage.module';

@Module({
  imports: [ObjectStorageModule],
  providers: [
    {
      provide: MEDIA_SAFETY_SCANNER,
      inject: [OBJECT_STORAGE],
      useFactory: (storage: ObjectStoragePort) => createMediaSafetyScannerFromEnv(storage),
    },
  ],
  exports: [MEDIA_SAFETY_SCANNER],
})
export class FileSafetyModule {}
