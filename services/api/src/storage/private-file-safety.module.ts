import { Module } from '@nestjs/common';
import { createMediaSafetyScannerFromEnv } from '../services-marketplace/clamav-media-safety-scanner.adapter';
import { MediaSafetyScannerPort } from '../services-marketplace/media-safety-scanner.port';
import { PRIVATE_OBJECT_STORAGE, ObjectStoragePort } from '../services-marketplace/object-storage.port';
import { PrivateObjectStorageModule } from './private-object-storage.module';

export const PRIVATE_FILE_SAFETY_SCANNER = Symbol('PRIVATE_FILE_SAFETY_SCANNER');

@Module({
  imports: [PrivateObjectStorageModule],
  providers: [
    {
      provide: PRIVATE_FILE_SAFETY_SCANNER,
      inject: [PRIVATE_OBJECT_STORAGE],
      useFactory: (storage: ObjectStoragePort): MediaSafetyScannerPort => createMediaSafetyScannerFromEnv(storage),
    },
  ],
  exports: [PRIVATE_FILE_SAFETY_SCANNER],
})
export class PrivateFileSafetyModule {}
