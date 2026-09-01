import { firstValueFrom, skip, take } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { NotificationRealtimeService } from './notification-realtime.service';

describe('NotificationRealtimeService', () => {
  it('delivers a resident approval event only to the targeted resident stream', async () => {
    const service = new NotificationRealtimeService();
    const residentOne = firstValueFrom(service.residentStream('society-1', 'resident-1').pipe(skip(1), take(1)));
    let residentTwoReceived = false;
    const residentTwo = service.residentStream('society-1', 'resident-2').pipe(skip(1)).subscribe(() => {
      residentTwoReceived = true;
    });

    service.publishResident({
      type: 'ACCESS_APPROVAL_REQUESTED',
      societyId: 'society-1',
      userId: 'resident-1',
      gateId: 'gate-1',
      requestId: 'request-1',
      subjectType: 'VISITOR',
      subjectName: 'Ravi',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    });

    const message = await residentOne;
    expect(message.data).toMatchObject({ requestId: 'request-1', userId: 'resident-1', status: 'PENDING' });
    expect(residentTwoReceived).toBe(false);
    residentTwo.unsubscribe();
  });

  it('broadcasts resident decisions to the society gate stream', async () => {
    const service = new NotificationRealtimeService();
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
