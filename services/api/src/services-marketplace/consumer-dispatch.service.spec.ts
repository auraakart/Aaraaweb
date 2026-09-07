import { describe, expect, it, vi } from 'vitest';
import { ConsumerDispatchService } from './consumer-dispatch.service';

function setup() {
  const tx = { $queryRaw: vi.fn(), $executeRaw: vi.fn() };
  const prisma = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return {
    tx,
    prisma,
    service: new ConsumerDispatchService(
      prisma as unknown as ConstructorParameters<typeof ConsumerDispatchService>[0],
    ),
  };
}

function sqlValues(call: unknown): unknown[] {
  return (call as { values?: unknown[] }).values ?? [];
}

const actorUserId = '11111111-1111-1111-1111-111111111111';
const consumerUserId = '22222222-2222-2222-2222-222222222222';
const bookingId = '33333333-3333-3333-3333-333333333333';
const providerId = '44444444-4444-4444-4444-444444444444';
const agentId = '55555555-5555-5555-5555-555555555555';
const assignmentId = '66666666-6666-6666-6666-666666666666';

describe('ConsumerDispatchService', () => {
  it('scopes consumer dispatch reads to the authenticated booking owner', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([{ id: bookingId }]).mockResolvedValueOnce([]);

    const result = await service.getConsumerDispatch(consumerUserId, bookingId);

    expect(result).toBeNull();
    const ownershipValues = sqlValues(prisma.$queryRaw.mock.calls[0][0]);
    expect(ownershipValues).toContain(consumerUserId);
    expect(ownershipValues).toContain(bookingId);
  });

  it('rejects dispatch reads for another consumer booking', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([]);

    await expect(service.getConsumerDispatch(consumerUserId, bookingId)).rejects.toThrow('Booking not found');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects an agent that does not belong to the booking provider', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: bookingId, userId: consumerUserId, providerId, status: 'CONFIRMED' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(service.assign(actorUserId, bookingId, agentId)).rejects.toThrow(
      'Selected agent is not active for the booking provider',
    );

    const agentLookupValues = sqlValues(tx.$queryRaw.mock.calls[2][0]);
    expect(agentLookupValues).toContain(agentId);
    expect(agentLookupValues).toContain(providerId);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('only assigns confirmed bookings and records an append-only assignment event', async () => {
    const { tx, service } = setup();
    const assignment = { id: assignmentId, bookingId, providerId, agentId, status: 'ASSIGNED' };
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: bookingId, userId: consumerUserId, providerId, status: 'CONFIRMED' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: agentId, providerId, displayName: 'Ravi', active: true }])
      .mockResolvedValueOnce([assignment]);
    tx.$executeRaw.mockResolvedValue(1);

    const result = await service.assign(actorUserId, bookingId, agentId);

    expect(result.id).toBe(assignmentId);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects assignment before booking confirmation', async () => {
    const { tx, service } = setup();
    tx.$queryRaw.mockResolvedValueOnce([
      { id: bookingId, userId: consumerUserId, providerId, status: 'REQUESTED' },
    ]);

    await expect(service.assign(actorUserId, bookingId, agentId)).rejects.toThrow(
      'Only confirmed consumer bookings can be assigned',
    );
  });

  it('rejects invalid dispatch state jumps', async () => {
    const { tx, service } = setup();
    tx.$queryRaw.mockResolvedValueOnce([
      { id: assignmentId, bookingId, providerId, agentId, status: 'ASSIGNED' },
    ]);

    await expect(service.transition(actorUserId, assignmentId, 'ARRIVED')).rejects.toThrow(
      'Invalid dispatch transition from ASSIGNED to ARRIVED',
    );
  });

  it('serializes a valid dispatch transition and appends an event', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: assignmentId, bookingId, providerId, agentId, status: 'ASSIGNED' }])
      .mockResolvedValueOnce([{ id: assignmentId, bookingId, providerId, agentId, status: 'ACCEPTED' }]);
    tx.$executeRaw.mockResolvedValue(1);

    const result = await service.transition(actorUserId, assignmentId, 'ACCEPTED', 'Agent acknowledged');

    expect(result.status).toBe('ACCEPTED');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
