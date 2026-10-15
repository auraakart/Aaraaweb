import { DevicePlatform } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { PushNotificationService } from './push-notification.service';
import { ConsumerNotificationsController } from './consumer-notifications.controller';

describe('ConsumerNotificationsController', () => {
  it('registers against the authenticated consumer user only', async () => {
    const registerConsumer = vi.fn().mockResolvedValue({ id: 'device-1' });
    const push = { registerConsumer } as unknown as PushNotificationService;
    const controller = new ConsumerNotificationsController(push);

    await controller.registerDevice(
      { token: 'token-1', platform: DevicePlatform.ANDROID },
      '11111111-1111-4111-8111-111111111111',
    );

    expect(registerConsumer).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'token-1',
      DevicePlatform.ANDROID,
      undefined,
    );
  });

  it('rejects registration without an authenticated user', () => {
    const push = { registerConsumer: vi.fn() } as unknown as PushNotificationService;
    const controller = new ConsumerNotificationsController(push);

    expect(() => controller.registerDevice(
      { token: 'token-1', platform: DevicePlatform.ANDROID },
      '',
    )).toThrow('Authenticated user is required');
  });
});
