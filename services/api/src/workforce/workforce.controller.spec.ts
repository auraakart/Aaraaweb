import { AccessRequestStatus, AccessSubjectType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { NotificationRealtimeService } from '../notifications/notification-realtime.service';
import { WorkforceController } from './workforce.controller';
import { WorkforceService } from './workforce.service';

describe('WorkforceController gate notifications', () => {
  it('publishes workforce attendance to every current configured occupant', async () => {
    const request = {
      id: 'request-a',
      societyId: 'society-a',
      unitId: 'unit-a',
      subjectType: AccessSubjectType.DOMESTIC_HELP,
      subjectName: 'Maya',
      status: AccessRequestStatus.CHECKED_IN,
      createdAt: new Date('2026-09-03T00:00:00.000Z'),
    };
    const workforce = {
      gateCheckIn: vi.fn().mockResolvedValue({ request, residentUserIds: ['tenant-a', 'family-a'] }),
    } as unknown as WorkforceService;
    const realtime = { publishResident: vi.fn() } as unknown as NotificationRealtimeService;
    const controller = new WorkforceController(workforce, realtime);

    await expect(controller.gateCheckIn(
      { gateId: '00000000-0000-4000-8000-000000000001', assignmentId: '00000000-0000-4000-8000-000000000002' },
      'idem-1',
      'society-a',
      'guard-a',
    )).resolves.toBe(request);

    expect(realtime.publishResident).toHaveBeenCalledTimes(2);
    expect(realtime.publishResident).toHaveBeenCalledWith(expect.objectContaining({ userId: 'tenant-a', status: 'CHECKED_IN' }));
    expect(realtime.publishResident).toHaveBeenCalledWith(expect.objectContaining({ userId: 'family-a', status: 'CHECKED_IN' }));
  });
});
