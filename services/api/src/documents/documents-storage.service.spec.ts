import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DocumentsStorageService } from './documents-storage.service';

describe('DocumentsStorageService', () => {
  const societyId = '11111111-1111-4111-8111-111111111111';

  it('creates society-scoped private upload intents without exposing a public url', async () => {
    const storage = {
      createUploadIntent: vi.fn().mockResolvedValue({
        storageKey: `societies/${societyId}/documents/file.pdf`,
        uploadUrl: 'https://private.example/upload', method: 'PUT', headers: { 'Content-Type':'application/pdf' }, publicUrl: null, expiresAt: '2026-09-14T04:00:00Z',
      }),
    };
    const service = new DocumentsStorageService(storage as never, {} as never);
    const result = await service.createUploadIntent(societyId, { contentType:'application/pdf', contentLengthBytes:100 });
    expect(result.storageKey).toContain(`societies/${societyId}/documents/`);
    expect(result).not.toHaveProperty('publicUrl');
  });

  it('rejects a cross-society storage key before download signing', () => {
    const storage = { createDownloadIntent: vi.fn() };
    const service = new DocumentsStorageService(storage as never, {} as never);
    expect(() => service.createDownloadIntent(societyId, 'societies/other/documents/file.pdf')).toThrow(BadRequestException);
    expect(storage.createDownloadIntent).not.toHaveBeenCalled();
  });

  it('rejects traversal-shaped storage keys before download signing', () => {
    const storage = { createDownloadIntent: vi.fn() };
    const service = new DocumentsStorageService(storage as never, {} as never);
    expect(() => service.createDownloadIntent(societyId, `societies/${societyId}/documents/../other/file.pdf`)).toThrow(BadRequestException);
    expect(storage.createDownloadIntent).not.toHaveBeenCalled();
  });

  it('deletes an uploaded object when metadata does not match', async () => {
    const storage = {
      headObject: vi.fn().mockResolvedValue({ contentType:'application/pdf', contentLengthBytes:101 }),
      deleteObject: vi.fn().mockResolvedValue(undefined),
    };
    const scanner = { scanObject: vi.fn() };
    const service = new DocumentsStorageService(storage as never, scanner as never);
    const key = `societies/${societyId}/documents/file.pdf`;
    await expect(service.verifyAndScanUpload(societyId, { storageKey:key, contentType:'application/pdf', contentLengthBytes:100 })).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.deleteObject).toHaveBeenCalledWith(key);
    expect(scanner.scanObject).not.toHaveBeenCalled();
  });

  it('deletes and rejects malware-positive documents', async () => {
    const storage = {
      headObject: vi.fn().mockResolvedValue({ contentType:'application/pdf', contentLengthBytes:100 }),
      deleteObject: vi.fn().mockResolvedValue(undefined),
    };
    const scanner = { scanObject: vi.fn().mockResolvedValue({ status:'INFECTED', engine:'clamav' }) };
    const service = new DocumentsStorageService(storage as never, scanner as never);
    const key = `societies/${societyId}/documents/file.pdf`;
    await expect(service.verifyAndScanUpload(societyId, { storageKey:key, contentType:'application/pdf', contentLengthBytes:100 })).rejects.toThrow('failed the safety scan');
    expect(storage.deleteObject).toHaveBeenCalledWith(key);
  });
});
