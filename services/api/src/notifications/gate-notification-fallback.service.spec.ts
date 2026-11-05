import { afterEach, describe, expect, it, vi } from 'vitest';
import { GateNotificationFallbackService } from './gate-notification-fallback.service';

const event = {
  type: 'ACCESS_APPROVAL_REQUESTED' as const,
  societyId: '11111111-1111-4111-8111-111111111111',
  unitId: '22222222-2222-4222-8222-222222222222',
  requestId: '33333333-3333-4333-8333-333333333333',
  subjectType: 'VISITOR',
  subjectName: 'Visitor A',
  status: 'PENDING',
  createdAt: new Date().toISOString(),
};
const recipientId = '44444444-4444-4444-8444-444444444444';

function fixture(phone: string | null = '+919876543210') {
  const tx = {
    unitOccupancy: {
      findFirst: vi.fn().mockResolvedValue(phone === null ? null : { user: { phone } }),
    },
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  const prisma = {
    // A global identity lookup must never be a fallback for a missing occupant.
    user: { findUnique: vi.fn(() => { throw new Error('Global user access forbidden'); }) },
    $executeRaw: vi.fn(() => { throw new Error('Root raw SQL forbidden'); }),
    withTenantContext: vi.fn(async (_societyId: string, action: (client: typeof tx) => Promise<unknown>) => action(tx)),
  };
  return { tx, prisma, service: new GateNotificationFallbackService(prisma as never) };
}

describe('GateNotificationFallbackService', () => {
  const originalProvider = process.env.GATE_IVR_PROVIDER;
  const originalNodeEnv = process.env.NODE_ENV;
  afterEach(() => {
    if (originalProvider === undefined) delete process.env.GATE_IVR_PROVIDER;
    else process.env.GATE_IVR_PROVIDER = originalProvider;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('simulates IVR only for an active selected-society occupant and stores a phone suffix', async () => {
    process.env.NODE_ENV = 'test';
    process.env.GATE_IVR_PROVIDER = 'simulator';
    const { tx, prisma, service } = fixture();

    await expect(service.fallback(event, recipientId, 'NO_PUSH_DEVICE')).resolves.toEqual(
      expect.objectContaining({ channel: 'IVR', status: 'SIMULATED', phoneSuffix: '3210', provider: 'simulator' }),
    );

    expect(prisma.withTenantContext).toHaveBeenCalledTimes(2);
    expect(prisma.withTenantContext).toHaveBeenNthCalledWith(1, event.societyId, expect.any(Function));
    expect(tx.unitOccupancy.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        societyId: event.societyId, unitId: event.unitId, userId: recipientId,
        active: true, gateNotificationEnabled: true,
        effectiveFrom: { lte: expect.any(Date) },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: expect.any(Date) } }],
      }),
      select: { user: { select: { phone: true } } },
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('requires a manual fallback when production IVR is not configured', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.GATE_IVR_PROVIDER;
    const { service, prisma } = fixture();
    await expect(service.fallback(event, recipientId, 'PUSH_UNAVAILABLE')).resolves.toEqual(
      expect.objectContaining({ channel: 'MANUAL', status: 'REQUIRED', reason: 'IVR_UNCONFIGURED' }),
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('does not expose an occupant phone to another society or a missing unit', async () => {
    process.env.NODE_ENV = 'test';
    process.env.GATE_IVR_PROVIDER = 'simulator';
    const { tx, prisma, service } = fixture();
    const anotherSociety = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    prisma.withTenantContext.mockImplementation(async (societyId, action) => {
      if (societyId === anotherSociety) {
        tx.unitOccupancy.findFirst.mockResolvedValueOnce(null);
      }
      return action(tx);
    });

    const first = await service.fallback(event, recipientId, 'NO_PUSH_DEVICE');
    const second = await service.fallback({ ...event, societyId: anotherSociety }, recipientId, 'NO_PUSH_DEVICE');
    const third = await service.fallback({ ...event, unitId: undefined }, recipientId, 'NO_PUSH_DEVICE');

    expect(first).toMatchObject({ channel: 'IVR', phoneSuffix: '3210' });
    expect(second).toMatchObject({ channel: 'MANUAL', reason: 'NO_RESIDENT_PHONE' });
    expect(third).toMatchObject({ channel: 'MANUAL', reason: 'NO_RESIDENT_PHONE' });
    expect(tx.unitOccupancy.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.withTenantContext.mock.calls.map(call => call[0])).toEqual([
      event.societyId, event.societyId, anotherSociety, anotherSociety, event.societyId,
    ]);
  });

  it('fails closed when selected-society context cannot be established', async () => {
    process.env.NODE_ENV = 'test';
    const { tx, prisma, service } = fixture();
    prisma.withTenantContext.mockRejectedValue(new Error('Selected tenant context unavailable'));

    await expect(service.fallback(event, recipientId, 'NO_PUSH_DEVICE')).rejects.toThrow(
      'Selected tenant context unavailable',
    );
    expect(tx.unitOccupancy.findFirst).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
