import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { PushNotificationService } from './push-notification.service';

const sdk = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('firebase-admin/messaging', () => ({ getMessaging: () => ({ sendEachForMulticast: sdk.send }) }));

const event = {
  type: 'PARCEL_RECEIVED' as const, societyId: 'society-1', userId: 'user-1', unitId: 'unit-1',
  parcelId: 'parcel-1', title: 'Parcel received', body: 'Collect at the gate', createdAt: '2026-10-17T00:00:00Z',
};
function harness() {
  sdk.send.mockReset();
  const registrations = [{ id: 'device-1', token: 'token-1' }, { id: 'device-2', token: 'token-2' }];
  const findMany = vi.fn().mockResolvedValue(registrations);
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const query = vi.fn().mockResolvedValue(registrations), execute = vi.fn().mockResolvedValue(1);
  const service = new PushNotificationService({ devicePushToken: { findMany, updateMany }, $queryRaw: query, $executeRaw: execute } as unknown as PrismaService);
  Object.assign(service, { firebaseApp: {} });
  return { service, findMany, updateMany, query, execute };
}

describe('Firebase 14 multicast transport contract', () => {
  it('preserves selected society/recipient lookup and the token-based multicast payload', async () => {
    const { service, findMany } = harness();
    sdk.send.mockResolvedValue({ responses: [{ success: true }, { success: true }] });
    await service.sendResidentEvent(event);
    expect(findMany).toHaveBeenCalledWith({ where: { societyId: 'society-1', userId: 'user-1', active: true }, select: { id: true, token: true, applicationId: true, firebaseProjectId: true } });
    expect(sdk.send).toHaveBeenCalledWith(expect.objectContaining({
      tokens: ['token-1', 'token-2'], notification: { title: event.title, body: event.body },
      data: expect.objectContaining({ societyId: 'society-1', parcelId: 'parcel-1', unitId: 'unit-1' }),
    }));
  });
  it('deactivates an invalid token but preserves a transiently failing token for durable retry', async () => {
    const { service, updateMany } = harness();
    sdk.send.mockResolvedValue({ responses: [
      { success: false, error: { code: 'messaging/registration-token-not-registered' } },
      { success: false, error: { code: 'messaging/server-unavailable' } },
    ] });
    await expect(service.sendResidentEvent(event)).rejects.toThrow('1 transient failure');
    expect(updateMany).toHaveBeenCalledWith({ where: { id: { in: ['device-1'] } }, data: { active: false } });
  });
  it('preserves consumer routing and clears only invalid consumer registrations', async () => {
    const { service, query, execute, findMany } = harness();
    sdk.send.mockResolvedValue({ responses: [{ success: false, error: { code: 'messaging/invalid-registration-token' } }, { success: true }] });
    await service.sendConsumerBookingEvent({ userId: 'user-1', bookingId: 'booking-1', offeringName: 'Cleaning', providerName: 'Provider', status: 'CONFIRMED' });
    expect(findMany).not.toHaveBeenCalled();
    expect(query.mock.calls[0][0].values).toContain('user-1');
    expect(sdk.send).toHaveBeenCalledWith(expect.objectContaining({ tokens: ['token-1', 'token-2'], data: { type: 'CONSUMER_SERVICE_BOOKING_STATUS', bookingId: 'booking-1', status: 'CONFIRMED' } }));
    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0][0].values).toContain('device-1');
    expect(execute.mock.calls[0][0].values).not.toContain('device-2');
  });
  it('propagates transport failure without deactivating valid registrations', async () => {
    const { service, updateMany, execute } = harness();
    sdk.send.mockRejectedValue(new Error('transport unavailable'));
    await expect(service.sendResidentEvent(event)).rejects.toThrow('transport unavailable');
    expect(updateMany).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
});
