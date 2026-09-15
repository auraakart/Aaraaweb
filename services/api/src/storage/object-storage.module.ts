import { Module } from '@nestjs/common';
import { OBJECT_STORAGE } from '../services-marketplace/object-storage.port';
import { createObjectStorageAdapterFromEnv } from '../services-marketplace/s3-compatible-object-storage.adapter';

@Module({
  providers: [{ provide: OBJECT_STORAGE, useFactory: createObjectStorageAdapterFromEnv }],
  exports: [OBJECT_STORAGE],
})
export class ObjectStorageModule {}
