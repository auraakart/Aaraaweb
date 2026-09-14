import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MediaSafetyScannerPort } from '../services-marketplace/media-safety-scanner.port';
import { ObjectStoragePort, PRIVATE_OBJECT_STORAGE } from '../services-marketplace/object-storage.port';
import { PRIVATE_FILE_SAFETY_SCANNER } from '../storage/private-file-safety.module';

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = new Map<string, string>([
  ['application/pdf', 'pdf'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

@Injectable()
export class DocumentsStorageService {
  constructor(
    @Inject(PRIVATE_OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(PRIVATE_FILE_SAFETY_SCANNER) private readonly scanner: MediaSafetyScannerPort,
  ) {}

  async createUploadIntent(societyId: string, input: { contentType: string; contentLengthBytes: number }) {
    const contentType = this.normaliseAndValidate(input.contentType, input.contentLengthBytes);
    const extension = ALLOWED_DOCUMENT_TYPES.get(contentType)!;
    const storageKey = `societies/${societyId}/documents/${randomUUID()}.${extension}`;
    const intent = await this.storage.createUploadIntent({
      storageKey,
      contentType,
      contentLengthBytes: input.contentLengthBytes,
    });
    return {
      storageKey: intent.storageKey,
      uploadUrl: intent.uploadUrl,
      method: intent.method,
      headers: intent.headers,
      expiresAt: intent.expiresAt,
    };
  }

  async verifyAndScanUpload(
    societyId: string,
    input: { storageKey: string; contentType: string; contentLengthBytes: number },
  ) {
    const contentType = this.normaliseAndValidate(input.contentType, input.contentLengthBytes);
    this.assertSocietyKey(societyId, input.storageKey);

    const object = await this.storage.headObject(input.storageKey);
    if (!object) throw new BadRequestException('Uploaded document object was not found');
    const actualType = object.contentType?.split(';', 1)[0]?.trim().toLowerCase() ?? null;
    if (actualType !== contentType || object.contentLengthBytes !== input.contentLengthBytes) {
      await this.storage.deleteObject(input.storageKey);
      throw new BadRequestException('Uploaded document does not match the declared file metadata');
    }

    const scan = await this.scanner.scanObject({
      storageKey: input.storageKey,
      contentType,
      contentLengthBytes: input.contentLengthBytes,
    });
    if (scan.status === 'INFECTED') {
      await this.storage.deleteObject(input.storageKey);
      throw new BadRequestException('Uploaded document failed the safety scan and was removed');
    }
    return { storageKey: input.storageKey, contentType, contentLengthBytes: input.contentLengthBytes, scanStatus: 'CLEAN' as const };
  }

  createDownloadIntent(societyId: string, storageKey: string) {
    this.assertSocietyKey(societyId, storageKey);
    return this.storage.createDownloadIntent(storageKey);
  }

  assertSocietyKey(societyId: string, storageKey: string) {
    const prefix = `societies/${societyId}/documents/`;
    if (!storageKey.startsWith(prefix) || storageKey.length <= prefix.length || storageKey.includes('..')) {
      throw new BadRequestException('Document storage key is outside the current society scope');
    }
  }

  private normaliseAndValidate(contentTypeRaw: string, contentLengthBytes: number) {
    const contentType = contentTypeRaw.trim().toLowerCase();
    if (!ALLOWED_DOCUMENT_TYPES.has(contentType)) {
      throw new BadRequestException('Only PDF, JPEG, PNG and WebP society documents are allowed');
    }
    if (!Number.isInteger(contentLengthBytes) || contentLengthBytes <= 0 || contentLengthBytes > MAX_DOCUMENT_BYTES) {
      throw new BadRequestException('Society documents must be between 1 byte and 5 MB');
    }
    return contentType;
  }
}
