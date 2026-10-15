import { Module } from '@nestjs/common';
import { PRIVATE_OBJECT_STORAGE } from '../services-marketplace/object-storage.port';
import { createPrivateObjectStorageAdapterFromEnv } from '../services-marketplace/s3-compatible-object-storage.adapter';

@Module({
  providers: [{ provide: PRIVATE_OBJECT_STORAGE, useFactory: createPrivateObjectStorageAdapterFromEnv }],
  exports: [PRIVATE_OBJECT_STORAGE],
})
export class PrivateObjectStorageModule {}
