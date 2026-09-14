import { ServiceUnavailableException } from '@nestjs/common';

export type ObjectStorageUploadIntent = {
  storageKey: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  publicUrl: string;
  expiresAt: string;
};

export type ObjectStorageDownloadIntent = {
  storageKey: string;
  downloadUrl: string;
  method: 'GET';
  expiresAt: string;
};

export type ObjectStorageObjectMetadata = {
  contentType: string | null;
  contentLengthBytes: number | null;
};

export interface ObjectStoragePort {
  createUploadIntent(input: {
    storageKey: string;
    contentType: string;
    contentLengthBytes: number;
  }): Promise<ObjectStorageUploadIntent>;
  createDownloadIntent(storageKey: string): Promise<ObjectStorageDownloadIntent>;
  headObject(storageKey: string): Promise<ObjectStorageObjectMetadata | null>;
  getObjectBytes(storageKey: string, maxBytes: number): Promise<Uint8Array | null>;
  deleteObject(storageKey: string): Promise<void>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export class UnconfiguredObjectStorageAdapter implements ObjectStoragePort {
  private unavailable(): never {
    throw new ServiceUnavailableException(
      'Object storage is not configured. Configure an object-storage adapter before enabling file operations.',
    );
  }

  createUploadIntent(): Promise<ObjectStorageUploadIntent> {
    return Promise.reject(this.unavailable());
  }

  createDownloadIntent(): Promise<ObjectStorageDownloadIntent> {
    return Promise.reject(this.unavailable());
  }

  headObject(): Promise<ObjectStorageObjectMetadata | null> {
    return Promise.reject(this.unavailable());
  }

  getObjectBytes(): Promise<Uint8Array | null> {
    return Promise.reject(this.unavailable());
  }

  deleteObject(): Promise<void> {
    return Promise.reject(this.unavailable());
  }
}
