import { DevicePlatform } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { consumerPushDedupeKey, PushNotificationService, residentPushDedupeKey } from './push-notification.service';

describe('push delivery dedupe keys', () => {
  it('keeps consumer status events stable and distinct', () => {
    const base = { userId: 'user-1', bookingId: 'booking-1', offeringName: 'Cleaning', providerName: 'Provider', status: 'CONFIRMED' as const };
    expect(consumerPushDedupeKey(base)).toBe('booking:booking-1:CONFIRMED:user:user-1');
    expect(consumerPushDedupeKey({ ...base, status: 'CANCELLED' })).not.toBe(consumerPushDedupeKey(base));
  });

  it('keys resident gate events by request, transition and recipient', () => {
    const key = residentPushDedupeKey({
      type: 'ACCESS_APPROVAL_REQUESTED',
      societyId: 'society-1',
      userId: 'user-1',
      requestId: 'request-1',
      subjectType: 'VISITOR',
      subjectName: 'Asha',
      status: 'PENDING',
      createdAt: '2026-09-18T00:00:00.000Z',
    });
    expect(key).toBe('access:request-1:ACCESS_APPROVAL_REQUESTED:PENDING:user:user-1');
  });
});

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

  it('invalidates any stale society binding before claiming a consumer token', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const queryRaw = vi.fn().mockResolvedValue([{ id: 'consumer-device-1', active: true }]);
    const prisma = { devicePushToken: { updateMany }, $queryRaw: queryRaw } as unknown as PrismaService;
    const service = new PushNotificationService(prisma);

    const result = await service.registerConsumer('11111111-1111-4111-8111-111111111111', ' token-2 ', DevicePlatform.ANDROID);

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { token: 'token-2', active: true },
      data: expect.objectContaining({ active: false }),
    }));
    expect(updateMany.mock.invocationCallOrder[0]).toBeLessThan(queryRaw.mock.invocationCallOrder[0]);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({ id: 'consumer-device-1', active: true }));
  });

  it('persists consumer push work even when FCM transport is unavailable', async () => {
    const enqueue = vi.fn().mockResolvedValue({ id: 'outbox-1', status: 'PENDING' });
    const attempt = vi.fn();
    const prisma = {} as unknown as PrismaService;
    const service = new PushNotificationService(prisma, { enqueue, attempt } as never);

    await service.sendConsumerBookingEvent({
      userId: '11111111-1111-4111-8111-111111111111',
      bookingId: '22222222-2222-4222-8222-222222222222',
      offeringName: 'Cleaning',
      providerName: 'Aara Services',
      status: 'CONFIRMED',
    });

    expect(enqueue).toHaveBeenCalledOnce();
    expect(attempt).not.toHaveBeenCalled();
  });

  it('persists direct resident events but leaves scheduled notices on NoticeDispatch', async () => {
    const enqueue = vi.fn().mockResolvedValue({ id: 'outbox-1', status: 'PENDING' });
    const attempt = vi.fn();
    const prisma = {} as unknown as PrismaService;
    const service = new PushNotificationService(prisma, { enqueue, attempt } as never);

    await service.sendResidentEvent({
      type: 'PARCEL_RECEIVED',
      societyId: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      unitId: '33333333-3333-4333-8333-333333333333',
      parcelId: '44444444-4444-4444-8444-444444444444',
      title: 'Parcel received',
      body: 'Collect at the gate',
      createdAt: '2026-09-18T00:00:00.000Z',
    });
    expect(enqueue).toHaveBeenCalledOnce();

    enqueue.mockClear();
    await service.sendResidentEvent({
      type: 'GENERAL_NOTICE_PUBLISHED',
      societyId: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      noticeId: '55555555-5555-4555-8555-555555555555',
      title: 'Water update',
      body: 'Supply resumes at 6 PM',
      createdAt: '2026-09-18T00:00:00.000Z',
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('unregisters consumer push by authenticated user and token', async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const prisma = { $executeRaw: executeRaw } as unknown as PrismaService;
    const service = new PushNotificationService(prisma);

    const result = await service.unregisterConsumer('11111111-1111-4111-8111-111111111111', ' token-2 ');

    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ count: 1 });
  });
});


describe('Durable push routing boundary', () => {
  const resident = {
    id: 'outbox-1', targetScope: 'RESIDENT' as const, societyId: 'society-1',
    userId: 'user-1', eventType: 'PARCEL_RECEIVED', dedupeKey: 'parcel-1',
    status: 'IN_FLIGHT' as const, attemptCount: 1,
    payload: { userId: 'user-1', societyId: 'society-1', type: 'PARCEL_RECEIVED' },
  };
  const consumer = {
    ...resident, targetScope: 'CONSUMER' as const, societyId: null,
    eventType: 'CONSUMER_SERVICE_BOOKING_STATUS', payload: { userId: 'user-1' },
  };

  function harness() {
    const findMany = vi.fn().mockResolvedValue([]);
    const queryRaw = vi.fn().mockResolvedValue([]);
    const prisma = { devicePushToken: { findMany }, $queryRaw: queryRaw } as unknown as PrismaService;
    const service = new PushNotificationService(prisma);
    // No device registrations means no external Firebase call. Configuration
    // allows the test to prove whether recipient lookup is reached.
    Object.assign(service, { firebaseApp: {} });
    const deliver = (service as unknown as {
      deliverOutbox(work: typeof resident | typeof consumer): Promise<void>;
    }).deliverOutbox.bind(service);
    return { deliver, findMany, queryRaw };
  }

  it.each([
    { ...resident, payload: { ...resident.payload, userId: 'other-user' } },
    { ...resident, payload: { ...resident.payload, societyId: 'other-society' } },
    { ...resident, payload: { ...resident.payload, type: 'BILLING_INVOICE_ISSUED' } },
    { ...resident, societyId: null },
    { ...consumer, payload: { userId: 'other-user' } },
    { ...consumer, societyId: 'society-1' },
    { ...consumer, eventType: 'PARCEL_RECEIVED' },
    { ...resident, payload: null },
    { ...resident, payload: [] },
    { ...resident, payload: 'invalid' },
    { ...resident, payload: {} },
    { ...resident, payload: { ...resident.payload, userId: 1 } },
    { ...resident, payload: { userId: resident.userId, type: resident.eventType } },
    { ...resident, targetScope: 'UNKNOWN' },
  ])('rejects mismatched routing before looking up tokens: %j', async work => {
    const { deliver, findMany, queryRaw } = harness();
    await expect(deliver(work as typeof resident)).rejects.toThrow('metadata mismatch');
    expect(findMany).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('uses matching resident society/user metadata for token lookup', async () => {
    const { deliver, findMany, queryRaw } = harness();
    await expect(deliver(resident)).resolves.toBeUndefined();
    expect(findMany).toHaveBeenCalledWith({
      where: { societyId: resident.societyId, userId: resident.userId, active: true },
      select: { id: true, token: true },
    });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('retains consumer user token routing with a null society envelope', async () => {
    const { deliver, findMany, queryRaw } = harness();
    await expect(deliver(consumer)).resolves.toBeUndefined();
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(queryRaw.mock.calls[0][0].values).toEqual([consumer.userId]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('preserves PostgreSQL UUID identity when payload casing differs', async () => {
    const { deliver, findMany } = harness();
    const userId = 'aabcdef0-1234-4234-8234-123456789abc';
    const societyId = 'bbbcdef0-1234-4234-8234-123456789abc';
    await expect(deliver({ ...resident, userId, societyId, payload: {
      ...resident.payload, userId: userId.toUpperCase(), societyId: societyId.toUpperCase(),
    } })).resolves.toBeUndefined();
    expect(findMany).toHaveBeenCalledOnce();
  });
});
