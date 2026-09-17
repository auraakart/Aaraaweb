import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ObjectStorageCleanupService,
  objectStorageCleanupEnabled,
  storageCleanupRetryDelayMinutes,
} from './object-storage-cleanup.service';

const originalDriver = process.env.OBJECT_STORAGE_DRIVER;

describe('ObjectStorageCleanupService', () => {
  beforeEach(() => {
    process.env.OBJECT_STORAGE_DRIVER = 's3';
  });

  afterEach(() => {
    if (originalDriver === undefined) delete process.env.OBJECT_STORAGE_DRIVER;
    else process.env.OBJECT_STORAGE_DRIVER = originalDriver;
  });

  it('stays dormant when provider-media object storage is disabled', async () => {
    delete process.env.OBJECT_STORAGE_DRIVER;
    const prisma = { $transaction: vi.fn() };
    const storage = { deleteObject: vi.fn() };
    const service = new ObjectStorageCleanupService(prisma as never, storage as never);

    expect(objectStorageCleanupEnabled()).toBe(false);
    await expect(service.runOnce()).resolves.toEqual({ skipped: true, reason: 'storage-disabled' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('backs off retries with a 24-hour cap', () => {
    expect(storageCleanupRetryDelayMinutes(1)).toBe(5);
    expect(storageCleanupRetryDelayMinutes(2)).toBe(10);
    expect(storageCleanupRetryDelayMinutes(10)).toBe(1440);
  });

  it('skips when another replica owns the cleanup lock', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValueOnce([{ locked: false }]) };
    const prisma = { $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };
    const storage = { deleteObject: vi.fn() };
    const service = new ObjectStorageCleanupService(prisma as never, storage as never);

    await expect(service.runOnce()).resolves.toEqual({ skipped: true, reason: 'cluster-lock-held' });
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('marks successfully deleted objects as complete', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce([{ id: '00000000-0000-4000-8000-000000000001', storageKey: 'providers/p1/media/logo.webp', attemptCount: 1 }]),
    };
    const prisma = {
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const storage = { deleteObject: vi.fn().mockResolvedValue(undefined) };
    const service = new ObjectStorageCleanupService(prisma as never, storage as never);

    await expect(service.runOnce()).resolves.toEqual({ skipped: false, deleted: 1, failed: 0 });
    expect(storage.deleteObject).toHaveBeenCalledWith('providers/p1/media/logo.webp');
    const sql = (prisma.$executeRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(sql).toContain('"storageDeletedAt" = CURRENT_TIMESTAMP');
  });

  it('records retry state when deletion fails', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce([{ id: '00000000-0000-4000-8000-000000000002', storageKey: 'providers/p2/media/gallery.jpg', attemptCount: 2 }]),
    };
    const prisma = {
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const storage = { deleteObject: vi.fn().mockRejectedValue(new Error('storage unavailable')) };
    const service = new ObjectStorageCleanupService(prisma as never, storage as never);

    await expect(service.runOnce()).resolves.toEqual({ skipped: false, deleted: 0, failed: 1 });
    const sql = (prisma.$executeRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(sql).toContain('"storageDeleteNextAttemptAt"');
    expect(sql).toContain('"storageDeleteLastError"');
  });
});
