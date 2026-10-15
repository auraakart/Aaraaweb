import { describe, expect, it, vi } from 'vitest';
import { ProviderMediaService } from './provider-media.service';
import { ConsumerProviderMediaController } from './consumer-provider-media.controller';

describe('ConsumerProviderMediaController', () => {
  const userId = '33333333-3333-4333-8333-333333333333';
  const mediaId = '44444444-4444-4444-8444-444444444444';

  const setup = () => {
    const media = {
      listMyMedia: vi.fn(),
      createMyUploadIntent: vi.fn(),
      confirmMyUpload: vi.fn(),
      removeMyMedia: vi.fn(),
    };
    return {
      media,
      controller: new ConsumerProviderMediaController(media as unknown as ProviderMediaService),
    };
  };

  it('redacts delivery URLs from non-approved provider media listings', async () => {
    const { controller, media } = setup();
    media.listMyMedia.mockResolvedValue([
      { id: mediaId, status: 'PENDING', publicUrl: 'https://cdn.example.test/pending.webp' },
      { id: '55555555-5555-4555-8555-555555555555', status: 'APPROVED', publicUrl: 'https://cdn.example.test/approved.webp' },
    ]);

    const result = await controller.list(userId);

    expect(result[0]?.publicUrl).toBeNull();
    expect(result[1]?.publicUrl).toBe('https://cdn.example.test/approved.webp');
  });

  it('never exposes storageKey or publicUrl in provider upload instructions', async () => {
    const { controller, media } = setup();
    media.createMyUploadIntent.mockResolvedValue({
      media: { id: mediaId, status: 'PENDING', publicUrl: 'https://cdn.example.test/pending.webp' },
      upload: {
        storageKey: 'providers/provider/media/private.webp',
        uploadUrl: 'https://objects.example.test/signed-put',
        method: 'PUT',
        headers: { 'Content-Type': 'image/webp' },
        publicUrl: 'https://cdn.example.test/pending.webp',
        expiresAt: '2026-09-11T12:00:00.000Z',
      },
    });

    const result = await controller.createUploadIntent(userId, {
      kind: 'GALLERY',
      contentType: 'image/webp',
      contentLengthBytes: 2048,
    });

    expect(result.media.publicUrl).toBeNull();
    expect(result.upload).toEqual({
      uploadUrl: 'https://objects.example.test/signed-put',
      method: 'PUT',
      headers: { 'Content-Type': 'image/webp' },
      expiresAt: '2026-09-11T12:00:00.000Z',
    });
    expect(result.upload).not.toHaveProperty('storageKey');
    expect(result.upload).not.toHaveProperty('publicUrl');
  });

  it('redacts a clean but still-pending media URL after upload confirmation', async () => {
    const { controller, media } = setup();
    media.confirmMyUpload.mockResolvedValue({
      id: mediaId,
      status: 'PENDING',
      malwareScanStatus: 'CLEAN',
      publicUrl: 'https://cdn.example.test/pending-clean.webp',
    });

    const result = await controller.confirmUpload(userId, mediaId);

    expect(result.publicUrl).toBeNull();
  });
});
