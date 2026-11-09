import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { NotificationRealtimeService } from '../notifications/notification-realtime.service';
import { ParcelReminderService } from './parcel-reminder.service';

const societyId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const parcelId = '33333333-3333-4333-8333-333333333333';
const unitId = '44444444-4444-4444-8444-444444444444';
const recipientId = '55555555-5555-4555-8555-555555555555';

describe('ParcelReminderService', () => {
  function setup() {
    const tx = { $queryRaw: vi.fn() };
    const prisma = { withTenantContext: vi.fn((_society: string, cb: (client: typeof tx) => unknown) => cb(tx)) };
    const realtime = { publishResident: vi.fn() };
    return { tx, prisma, realtime, service: new ParcelReminderService(prisma as never, realtime as unknown as NotificationRealtimeService) };
  }

  it('rejects reminder before parcel is overdue', async () => {
    const { tx, prisma, realtime, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: parcelId, unitId, recipientUserId: recipientId, courierName: null, receivedAt: new Date(), status: 'RECEIVED' }])
      .mockResolvedValueOnce([{ overdue: false, cooldownActive: false }]);
    await expect(service.remind(societyId, actorId, parcelId)).rejects.toBeInstanceOf(BadRequestException);
    expect(realtime.publishResident).not.toHaveBeenCalled();
    expect(prisma.withTenantContext).toHaveBeenCalledWith(societyId, expect.any(Function));
  });

  it('rejects reminder during cooldown', async () => {
    const { tx, prisma, realtime, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: parcelId, unitId, recipientUserId: recipientId, courierName: null, receivedAt: new Date(), status: 'RECEIVED' }])
      .mockResolvedValueOnce([{ overdue: true, cooldownActive: true }]);
    await expect(service.remind(societyId, actorId, parcelId)).rejects.toThrow('cooldown');
    expect(realtime.publishResident).not.toHaveBeenCalled();
    expect(prisma.withTenantContext).toHaveBeenCalledWith(societyId, expect.any(Function));
  });

  it('records evidence transactionally before notifying the recipient', async () => {
    const { tx, prisma, realtime, service } = setup();
    const occurredAt = new Date();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: parcelId, unitId, recipientUserId: recipientId, courierName: 'BlueDart', receivedAt: new Date(), status: 'RECEIVED' }])
      .mockResolvedValueOnce([{ overdue: true, cooldownActive: false }])
      .mockResolvedValueOnce([{ occurredAt }]);
    await expect(service.remind(societyId, actorId, parcelId)).resolves.toMatchObject({ parcelId, cooldownHours: 6 });
    const eventSql = (tx.$queryRaw.mock.calls[2][0] as { strings: readonly string[] }).strings.join(' ');
    expect(eventSql).toContain('REMINDER_SENT');
    expect(prisma.withTenantContext).toHaveBeenCalledWith(societyId, expect.any(Function));
    expect(realtime.publishResident).toHaveBeenCalledWith(expect.objectContaining({
      type: 'PARCEL_RECEIVED', societyId, userId: recipientId, parcelId,
    }));
  });
});
