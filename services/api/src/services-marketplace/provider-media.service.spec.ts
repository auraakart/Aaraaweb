import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerProviderOperatorService } from './consumer-provider-operator.service';
import { MediaSafetyScannerPort } from './media-safety-scanner.port';
import { ObjectStoragePort } from './object-storage.port';
import { ProviderMediaService } from './provider-media.service';

describe('ProviderMediaService', () => {
  const providerId = '22222222-2222-4222-8222-222222222222';
  const userId = '33333333-3333-4333-8333-333333333333';
  const mediaId = '44444444-4444-4444-8444-444444444444';

  const pendingMedia = () => ({
    id: mediaId,
    providerId,
    kind: 'GALLERY',
    storageKey: 'providers/provider/media/image.webp',
    publicUrl: 'https://cdn.example.test/provider-image.webp',
    altText: null,
    sortOrder: 0,
    status: 'PENDING',
    contentType: 'image/webp',
    contentLengthBytes: 2048,
    originalFileName: 'image.webp',
    uploadedAt: null,
    malwareScanStatus: 'PENDING',
    malwareScannedAt: null,
    malwareScanEngine: null,
    malwareScanReference: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const setup = () => {
    const prismaMock = {
      $queryRaw: vi.fn(),
      $executeRaw: vi.fn(),
      $transaction: vi.fn(),
    };
    const operatorsMock = {
      resolveProvider: vi.fn().mockResolvedValue({ providerId }),
    };
    const storageMock = {
      createUploadIntent: vi.fn(),
      headObject: vi.fn(),
      deleteObject: vi.fn(),
    };
    const scannerMock = {
      scanObject: vi.fn(),
    };
    return {
      prisma: prismaMock,
      operators: operatorsMock,
      storage: storageMock,
      scanner: scannerMock,
      service: new ProviderMediaService(
        prismaMock as unknown as PrismaService,
        operatorsMock as unknown as ConsumerProviderOperatorService,
        storageMock as unknown as ObjectStoragePort,
        scannerMock as unknown as MediaSafetyScannerPort,
      ),
    };
  };

  it('rejects unsafe media types before asking storage for an upload URL', async () => {
    const { service, storage } = setup();

    await expect(
      service.createMyUploadIntent(userId, {
        kind: 'GALLERY',
        contentType: 'image/svg+xml',
        contentLengthBytes: 1024,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(storage.createUploadIntent).not.toHaveBeenCalled();
  });

  it('creates a pending record only from a server-generated storage intent', async () => {
    const { prisma, service, storage } = setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ count: 0n }])
      .mockResolvedValueOnce([
        {
          id: mediaId,
          providerId,
          kind: 'GALLERY',
          publicUrl: 'https://cdn.example.test/provider-image.webp',
          status: 'PENDING',
          malwareScanStatus: 'PENDING',
        },
      ]);
    storage.createUploadIntent.mockResolvedValue({
      storageKey: `${providerId}/generated.webp`,
      uploadUrl: 'https://uploads.example.test/signed',
      method: 'PUT',
      headers: { 'content-type': 'image/webp' },
      publicUrl: 'https://cdn.example.test/provider-image.webp',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });

    const result = await service.createMyUploadIntent(userId, {
      kind: 'GALLERY',
      contentType: 'image/webp',
      contentLengthBytes: 2048,
      originalFileName: 'kitchen.webp',
      altText: 'Completed modular kitchen',
    });

    expect(storage.createUploadIntent).toHaveBeenCalledTimes(1);
    const storageInput = storage.createUploadIntent.mock.calls[0]?.[0] as { storageKey: string };
    expect(storageInput.storageKey).toContain(`providers/${providerId}/media/`);
    expect(result.media.status).toBe('PENDING');
  });

  it('removes a mismatched upload before invoking the malware scanner', async () => {
    const { prisma, scanner, service, storage } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([pendingMedia()]);
    prisma.$executeRaw.mockResolvedValue(1);
    storage.headObject.mockResolvedValue({ contentType: 'image/png', contentLengthBytes: 2048 });
    storage.deleteObject.mockResolvedValue(undefined);

    await expect(service.confirmMyUpload(userId, mediaId)).rejects.toBeInstanceOf(BadRequestException);

    expect(scanner.scanObject).not.toHaveBeenCalled();
    expect(storage.deleteObject).toHaveBeenCalledWith('providers/provider/media/image.webp');
  });

  it('records a clean malware scan before confirming an upload', async () => {
    const { prisma, scanner, service, storage } = setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([pendingMedia()])
      .mockResolvedValueOnce([{ ...pendingMedia(), uploadedAt: new Date(), malwareScanStatus: 'CLEAN' }]);
    storage.headObject.mockResolvedValue({ contentType: 'image/webp', contentLengthBytes: 2048 });
    scanner.scanObject.mockResolvedValue({ status: 'CLEAN', engine: 'test-scanner', reference: 'scan-1' });

    const result = await service.confirmMyUpload(userId, mediaId);

    expect(scanner.scanObject).toHaveBeenCalledWith({
      storageKey: 'providers/provider/media/image.webp',
      contentType: 'image/webp',
      contentLengthBytes: 2048,
    });
    expect(result.malwareScanStatus).toBe('CLEAN');
  });

  it('removes infected media and attempts physical object deletion', async () => {
    const { prisma, scanner, service, storage } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([pendingMedia()]);
    prisma.$executeRaw.mockResolvedValue(1);
    storage.headObject.mockResolvedValue({ contentType: 'image/webp', contentLengthBytes: 2048 });
    storage.deleteObject.mockResolvedValue(undefined);
    scanner.scanObject.mockResolvedValue({ status: 'INFECTED', engine: 'test-scanner', reference: 'scan-bad' });

    await expect(service.confirmMyUpload(userId, mediaId)).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(storage.deleteObject).toHaveBeenCalledWith('providers/provider/media/image.webp');
  });

  it('fails closed when malware scanning is unavailable', async () => {
    const { prisma, scanner, service, storage } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([pendingMedia()]);
    prisma.$executeRaw.mockResolvedValue(1);
    storage.headObject.mockResolvedValue({ contentType: 'image/webp', contentLengthBytes: 2048 });
    scanner.scanObject.mockRejectedValue(new ServiceUnavailableException('scanner unavailable'));

    await expect(service.confirmMyUpload(userId, mediaId)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('blocks human moderation unless the upload has a clean malware scan', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([
      { ...pendingMedia(), uploadedAt: new Date(), malwareScanStatus: 'ERROR' },
    ]);

    await expect(service.reviewMedia(userId, mediaId, 'APPROVED')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('fails closed when object storage is unavailable and does not create a media row', async () => {
    const { prisma, service, storage } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([{ count: 0n }]);
    storage.createUploadIntent.mockRejectedValue(
      new ServiceUnavailableException('Provider media storage is not configured'),
    );

    await expect(
      service.createMyUploadIntent(userId, {
        kind: 'LOGO',
        contentType: 'image/png',
        contentLengthBytes: 512,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
