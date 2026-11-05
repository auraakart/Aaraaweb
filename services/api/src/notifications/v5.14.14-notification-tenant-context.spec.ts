import { describe, expect, it, vi } from 'vitest';
import { PushNotificationService } from './push-notification.service';
import { NotificationRealtimeService } from './notification-realtime.service';
import { GateNotificationFallbackService } from './gate-notification-fallback.service';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const user = '33333333-3333-4333-8333-333333333333';

function tenantClient<T>(tx: T) {
  const withTenantContext = vi.fn(async (societyId: string, operation: (context: T) => Promise<unknown>) => {
    void societyId;
    return operation(tx);
  });
  return withTenantContext;
}

describe('V5.14.14 society notification DB context', () => {
  it('reads resident delivery readiness only through the selected society transaction', async () => {
    const count = vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    const withTenantContext = tenantClient({ devicePushToken: { count } });
    const rootCount = vi.fn(() => { throw Error('root client must not read resident tokens'); });
    const service = new PushNotificationService({
      devicePushToken: { count: rootCount }, withTenantContext,
    } as never);
    Object.assign(service, { firebaseApp: {} });
    expect(await service.residentDeliveryReadiness(a, user)).toEqual({
      transportConfigured: true, activeDeviceCount: 2,
    });
    expect(await service.residentDeliveryReadiness(b, user)).toEqual({
      transportConfigured: true, activeDeviceCount: 0,
    });
    expect(withTenantContext.mock.calls.map(([id]) => id)).toEqual([a, b]);
    expect(count.mock.calls.map(([query]) => query.where)).toEqual([
      { societyId: a, userId: user, active: true },
      { societyId: b, userId: user, active: true },
    ]);
    expect(rootCount).not.toHaveBeenCalled();
  });

  it('unregisters only the selected resident token and never falls back to unrestricted Prisma', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const withTenantContext = tenantClient({ devicePushToken: { updateMany } });
    const rootUpdate = vi.fn(() => { throw Error('root client must not deactivate resident tokens'); });
    const service = new PushNotificationService({
      devicePushToken: { updateMany: rootUpdate }, withTenantContext,
    } as never);
    await expect(service.unregister(a, user, ' token-1 ')).resolves.toEqual({ count: 1 });
    expect(withTenantContext).toHaveBeenCalledWith(a, expect.any(Function));
    expect(updateMany).toHaveBeenCalledWith({
      where: { societyId: a, userId: user, token: 'token-1', active: true },
      data: expect.objectContaining({ active: false }),
    });
    expect(rootUpdate).not.toHaveBeenCalled();
  });

  it('resolves maintenance invoice units inside tenant context, suppressing foreign/missing invoices', async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce({ unitId: 'unit-a' })
      .mockResolvedValueOnce(null);
    const withTenantContext = tenantClient({ maintenanceInvoice: { findFirst } });
    const rootFind = vi.fn(() => { throw Error('root client must not enrich maintenance notifications'); });
    const sendResidentEvent = vi.fn().mockResolvedValue(undefined);
    const service = new NotificationRealtimeService(
      { sendResidentEvent } as never,
      { notificationRecipients: vi.fn().mockResolvedValue([]) } as never,
      { maintenanceInvoice: { findFirst: rootFind }, withTenantContext } as never,
    );
    const event = {
      type: 'MAINTENANCE_DUE_ISSUED' as const, societyId: a, userId: user,
      invoiceId: 'invoice-a', title: 'Maintenance due', body: 'Amount due', createdAt: '2026-09-01',
    };
    await service.dispatchResident(event);
    await service.dispatchResident({ ...event, societyId: b, invoiceId: 'foreign-invoice' });
    expect(withTenantContext.mock.calls.map(([id]) => id)).toEqual([a, b]);
    expect(findFirst.mock.calls.map(([query]) => query.where)).toEqual([
      { id: 'invoice-a', societyId: a },
      { id: 'foreign-invoice', societyId: b },
    ]);
    expect(sendResidentEvent).toHaveBeenCalledTimes(1);
    expect(sendResidentEvent).toHaveBeenCalledWith(expect.objectContaining({ unitId: 'unit-a', societyId: a }));
    expect(rootFind).not.toHaveBeenCalled();
  });

  it('writes gate fallback evidence through the selected society transaction, never unrestricted SQL', async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const withTenantContext = tenantClient({ $executeRaw: executeRaw });
    const rootExecute = vi.fn(() => { throw Error('root client must not write gate evidence'); });
    const service = new GateNotificationFallbackService({
      $executeRaw: rootExecute, withTenantContext,
    } as never);
    const event = {
      type: 'ACCESS_APPROVAL_REQUESTED' as const, societyId: a,
      requestId: '44444444-4444-4444-8444-444444444444', userId: user,
      subjectType: 'VISITOR', subjectName: 'Guest', status: 'PENDING',
      createdAt: '2026-09-01',
    };
    await expect(service.recordPushQueued(event, user)).resolves.toEqual(
      expect.objectContaining({ channel: 'PUSH', status: 'QUEUED' }),
    );
    await service.recordPushQueued({ ...event, societyId: b }, user);
    expect(withTenantContext.mock.calls.map(([id]) => id)).toEqual([a, b]);
    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(executeRaw.mock.calls.map(([sql]) => sql.values[0])).toEqual([a, b]);
    const sqlText = executeRaw.mock.calls[0][0].strings.join(' ');
    expect(sqlText).toContain('ON CONFLICT ("societyId","requestId","userId","channel")');
    expect(rootExecute).not.toHaveBeenCalled();
  });
});
