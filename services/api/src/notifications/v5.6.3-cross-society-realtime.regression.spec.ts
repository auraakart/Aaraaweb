import { describe, expect, it, vi } from 'vitest';
import { NotificationRealtimeService } from './notification-realtime.service';
import type { PushNotificationService } from './push-notification.service';
import type { GateRecipientService } from './gate-recipient.service';
import type { PrismaService } from '../prisma/prisma.service';

const timestamp = '2026-10-16T00:00:00.000Z';

function setup() {
  const sendResidentEvent = vi.fn().mockResolvedValue(undefined);
  const notificationRecipients = vi.fn().mockImplementation(async (societyId: string, unitId: string) =>
    societyId === 'society-a' && unitId === 'unit-a'
      ? [{ userId: 'current-tenant-a', gateApprovalEnabled: true }]
      : [],
  );
  const findFirst = vi.fn().mockResolvedValue(null);
  const push = { sendResidentEvent } as unknown as PushNotificationService;
  const recipients = { notificationRecipients } as unknown as GateRecipientService;
  const prisma = { maintenanceInvoice: { findFirst } } as unknown as PrismaService;
  const service = new NotificationRealtimeService(push, recipients, prisma);
  return { service, sendResidentEvent, notificationRecipients, findFirst };
}

describe('V5.6.3 nonproduction cross-society realtime notification regression', () => {
  it("keeps one user's separate society resident streams isolated, including after unsubscribe", async () => {
    const { service, sendResidentEvent } = setup();
    const a: unknown[] = [];
    const b: unknown[] = [];
    const subA = service.residentStream('society-a', 'shared-user').subscribe(e => a.push(e.data));
    const subB = service.residentStream('society-b', 'shared-user').subscribe(e => b.push(e.data));
    try {
      await service.dispatchResident({
        type: 'GENERAL_NOTICE_PUBLISHED', societyId: 'society-a',
        userId: 'shared-user', title: 'A', body: 'Society A notice', createdAt: timestamp,
      });
      expect(a).toHaveLength(2);
      expect(b).toEqual([{ type: 'CONNECTED' }]);
      expect(sendResidentEvent).toHaveBeenCalledTimes(1);
      expect(sendResidentEvent).toHaveBeenCalledWith(expect.objectContaining({ societyId: 'society-a' }));

      subA.unsubscribe();
      await service.dispatchResident({
        type: 'GENERAL_NOTICE_PUBLISHED', societyId: 'society-b',
        userId: 'shared-user', title: 'B', body: 'Society B notice', createdAt: timestamp,
      });
      expect(a).toHaveLength(2);
      expect(b).toHaveLength(2);
      expect(b[1]).toMatchObject({ societyId: 'society-b', title: 'B' });
      expect(sendResidentEvent).toHaveBeenCalledTimes(2);
    } finally {
      subA.unsubscribe();
      subB.unsubscribe();
    }
  });

  it('keeps society gate decision streams isolated even with a shared resident identity', () => {
    const { service } = setup();
    const a: unknown[] = [];
    const b: unknown[] = [];
    const subA = service.gateStream('society-a').subscribe(e => a.push(e.data));
    const subB = service.gateStream('society-b').subscribe(e => b.push(e.data));
    try {
      service.publishGateUpdate({
        type: 'ACCESS_APPROVAL_DECIDED', societyId: 'society-a',
        userId: 'shared-user', gateId: 'gate-a', requestId: 'req-a',
        subjectType: 'VISITOR', subjectName: 'Test guest', status: 'APPROVED', createdAt: timestamp,
      });
      expect(a).toHaveLength(2);
      expect(b).toEqual([{ type: 'CONNECTED' }]);
      service.publishGateUpdate({
        type: 'ACCESS_APPROVAL_DECIDED', societyId: 'society-b',
        userId: 'shared-user', gateId: 'gate-b', requestId: 'req-b',
        subjectType: 'VISITOR', subjectName: 'Test guest', status: 'REJECTED', createdAt: timestamp,
      });
      expect(a).toHaveLength(2);
      expect(b).toHaveLength(2);
      expect(a[1]).toMatchObject({ gateId: 'gate-a', societyId: 'society-a' });
      expect(b[1]).toMatchObject({ gateId: 'gate-b', societyId: 'society-b' });
    } finally {
      subA.unsubscribe();
      subB.unsubscribe();
    }
  });

  it('uses the requesting society and unit for occupant routing and never sends to a foreign society stream', async () => {
    const { service, notificationRecipients, sendResidentEvent } = setup();
    const foreign: unknown[] = [];
    const sameSociety: unknown[] = [];
    const foreignSub = service.residentStream('society-b', 'current-tenant-a').subscribe(e => foreign.push(e.data));
    const ownSub = service.residentStream('society-a', 'current-tenant-a').subscribe(e => sameSociety.push(e.data));
    try {
      const gate = {
        type: 'ACCESS_APPROVAL_REQUESTED' as const, societyId: 'society-a', unitId: 'unit-a',
        requestId: 'visitor-a', subjectType: 'VISITOR', subjectName: 'Test guest',
        status: 'PENDING', createdAt: timestamp,
      };
      await service.publishUnitOccupants(gate);
      expect(notificationRecipients).toHaveBeenCalledWith('society-a', 'unit-a');
      expect(sendResidentEvent).toHaveBeenCalledTimes(1);
      expect(sendResidentEvent).toHaveBeenCalledWith(expect.objectContaining({
        societyId: 'society-a', userId: 'current-tenant-a', unitId: 'unit-a',
      }));
      expect(foreign).toEqual([{ type: 'CONNECTED' }]);
      expect(sameSociety).toHaveLength(2);

      await service.publishUnitOccupants({ ...gate, societyId: 'society-b', requestId: 'visitor-b' });
      expect(notificationRecipients).toHaveBeenCalledWith('society-b', 'unit-a');
      expect(sendResidentEvent).toHaveBeenCalledTimes(1);
      expect(foreign).toEqual([{ type: 'CONNECTED' }]);
    } finally {
      foreignSub.unsubscribe();
      ownSub.unsubscribe();
    }
  });

  it('fails closed for a missing or foreign-society invoice before creating any SSE or push notification', async () => {
    const { service, findFirst, sendResidentEvent } = setup();
    const messages: unknown[] = [];
    const sub = service.residentStream('society-a', 'shared-user').subscribe(e => messages.push(e.data));
    try {
      await service.dispatchResident({
        type: 'MAINTENANCE_DUE_ISSUED', societyId: 'society-a', userId: 'shared-user',
        invoiceId: 'invoice-in-society-b', title: 'Due', body: 'Untrusted invoice', createdAt: timestamp,
      });
      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'invoice-in-society-b', societyId: 'society-a' },
        select: { unitId: true },
      });
      expect(sendResidentEvent).not.toHaveBeenCalled();
      expect(messages).toEqual([{ type: 'CONNECTED' }]);
    } finally {
      sub.unsubscribe();
    }
  });

  it('fails closed on invoice lookup errors instead of dispatching a partial billing notification', async () => {
    const { service, findFirst, sendResidentEvent } = setup();
    findFirst.mockRejectedValueOnce(new Error('TEST database unavailable'));
    const messages: unknown[] = [];
    const sub = service.residentStream('society-a', 'shared-user').subscribe(e => messages.push(e.data));
    try {
      await expect(service.dispatchResident({
        type: 'MAINTENANCE_DUE_ISSUED', societyId: 'society-a', userId: 'shared-user',
        invoiceId: 'invoice-a', title: 'Due', body: 'Payment due', createdAt: timestamp,
      })).rejects.toThrow('TEST database unavailable');
      expect(sendResidentEvent).not.toHaveBeenCalled();
      expect(messages).toEqual([{ type: 'CONNECTED' }]);
    } finally {
      sub.unsubscribe();
    }
  });
});
