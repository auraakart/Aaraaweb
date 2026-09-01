import { DevicePlatform } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { PushNotificationService } from './push-notification.service';

describe('PushNotificationService', () => {
  it('upserts a device token to the authenticated society and user', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'device-1' });
    const prisma = { devicePushToken: { upsert } } as unknown as PrismaService;
    const service = new PushNotificationService(prisma);

    await service.register('society-1', 'user-1', ' token-1 ', DevicePlatform.ANDROID, 'device-a');

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { token: 'token-1' },
      create: expect.objectContaining({ societyId: 'society-1', userId: 'user-1', token: 'token-1', platform: DevicePlatform.ANDROID, active: true }),
      update: expect.objectContaining({ societyId: 'society-1', userId: 'user-1', active: true }),
    }));
  });

  it('deactivates only the authenticated user token on unregister', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { devicePushToken: { updateMany } } as unknown as PrismaService;
    const service = new PushNotificationService(prisma);

    await service.unregister('society-1', 'user-1', 'token-1');

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { societyId: 'society-1', userId: 'user-1', token: 'token-1', active: true },
      data: expect.objectContaining({ active: false }),
    }));
  });
});
