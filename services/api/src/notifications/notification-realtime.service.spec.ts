import { firstValueFrom, skip, take } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { NotificationRealtimeService } from './notification-realtime.service';
import type { PushNotificationService } from './push-notification.service';
import type { GateRecipientService } from './gate-recipient.service';

function createService() {
  const push = {
    sendResidentEvent: vi.fn().mockResolvedValue(undefined),
  } as unknown as PushNotificationService;
  const recipients = {
    notificationRecipients: vi.fn().mockResolvedValue([
      { userId: 'resident-1', gateApprovalEnabled: true },
      { userId: 'tenant-1', gateApprovalEnabled: true },
    ]),
  } as unknown as GateRecipientService;
  return { service: new NotificationRealtimeService(push, recipients), push, recipients };
}

describe('NotificationRealtimeService', () => {
  it('delivers a resident approval event only to the targeted resident stream and dispatches push', async () => {
    const { service, push } = createService();
    const residentOne = firstValueFrom(service.residentStream('society-1', 'resident-1').pipe(skip(1), take(1)));
    let residentTwoReceived = false;
    const residentTwo = service.residentStream('society-1', 'resident-2').pipe(skip(1)).subscribe(() => {
      residentTwoReceived = true;
    });

    const event = {
      type: 'ACCESS_APPROVAL_REQUESTED' as const,
      societyId: 'society-1',
      userId: 'resident-1',
      gateId: 'gate-1',
      requestId: 'request-1',
      subjectType: 'VISITOR',
      subjectName: 'Ravi',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    service.publishResident(event);

    const message = await residentOne;
    expect(message.data).toMatchObject({ requestId: 'request-1', userId: 'resident-1', status: 'PENDING' });
    expect(residentTwoReceived).toBe(false);
    expect(push.sendResidentEvent).toHaveBeenCalledWith(event);
    residentTwo.unsubscribe();
  });

  it('routes gate events to active occupants rather than a non-resident owner', async () => {
    const { service, push, recipients } = createService();
    await service.publishUnitOccupants({
      type: 'ACCESS_APPROVAL_REQUESTED',
      societyId: 'society-1',
      unitId: 'unit-1',
      requestId: 'request-2',
      subjectType: 'VISITOR',
      subjectName: 'Guest',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    });

    expect(recipients.notificationRecipients).toHaveBeenCalledWith('society-1', 'unit-1');
    expect(push.sendResidentEvent).toHaveBeenCalledTimes(2);
    expect(push.sendResidentEvent).toHaveBeenCalledWith(expect.objectContaining({ userId: 'tenant-1' }));
    expect(push.sendResidentEvent).not.toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner-non-resident' }));
  });

  it('broadcasts resident decisions to the society gate stream', async () => {
    const { service } = createService();
    const gateEvent = firstValueFrom(service.gateStream('society-1').pipe(skip(1), take(1)));

    service.publishGateUpdate({
      type: 'ACCESS_APPROVAL_DECIDED',
      societyId: 'society-1',
      userId: 'resident-1',
      gateId: 'gate-1',
      requestId: 'request-1',
      subjectType: 'DELIVERY',
      subjectName: 'Courier',
      status: 'APPROVED',
      createdAt: new Date().toISOString(),
    });

    const message = await gateEvent;
    expect(message.data).toMatchObject({ requestId: 'request-1', gateId: 'gate-1', status: 'APPROVED' });
  });
});
