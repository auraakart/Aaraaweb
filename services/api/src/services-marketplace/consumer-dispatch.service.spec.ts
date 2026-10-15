import { describe, expect, it, vi } from 'vitest';
import { ConsumerDispatchService } from './consumer-dispatch.service';

function setup() {
  const tx = { $queryRaw: vi.fn(), $executeRaw: vi.fn() };
  const prisma = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const push = { sendConsumerBookingEvent: vi.fn().mockResolvedValue(undefined) };
  return {
    tx,
    prisma,
    push,
    service: new ConsumerDispatchService(
      prisma as unknown as ConstructorParameters<typeof ConsumerDispatchService>[0],
      push as unknown as ConstructorParameters<typeof ConsumerDispatchService>[1],
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


  it('rejects candidate requests for unknown or unverified provider bookings', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.listDispatchCandidates(bookingId)).rejects.toThrow('Verified provider booking not found');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw.mock.calls[0][0].strings.join(' ')).toContain('ProviderVerificationStatus');
  });

  it('does not suggest candidates for an assigned booking', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([{ id: bookingId, providerId, status: 'CONFIRMED', hasActiveAssignment: true }]);
    await expect(service.listDispatchCandidates(bookingId)).rejects.toThrow('unassigned confirmed booking');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('offers a scoped provisional shortlist with no invented live ETA', async () => {
    const { prisma, tx, service } = setup();
    const from = new Date('2030-01-01T10:00:00Z');
    const until = new Date('2030-01-01T11:00:00Z');
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: bookingId, providerId, status: 'CONFIRMED', hasActiveAssignment: false, scheduledFrom: from, scheduledUntil: until }])
      .mockResolvedValueOnce([
        { agentId, displayName: 'Ravi', activeAssignmentCount: 0, hasScheduleConflict: false },
        { agentId: '77777777-7777-4777-8777-777777777777', displayName: 'Busy', activeAssignmentCount: 2, hasScheduleConflict: true },
      ]);
    const output = await service.listDispatchCandidates(bookingId);
    expect(output.candidates[0]).toEqual(expect.objectContaining({
      agentId, provisionallyAvailable: true, availabilityConfirmed: false,
      skillsVerifiedForOffering: false, etaMinutes: null,
    }));
    expect(output.candidates[1].provisionallyAvailable).toBe(false);
    expect(output.assignmentRequired).toBe(true);
    const sqlQuery = prisma.$queryRaw.mock.calls[1][0] as { values: unknown[]; strings: string[] };
    const sql = sqlQuery.strings.join(' ');
    expect(sql).toContain('assignedBooking."scheduledFrom"');
    expect(sql).toContain('assignedBooking."scheduledUntil"');
    expect(sql).toContain('ag."providerId"');
    expect(sql).toContain('ag."active" = true');
    expect(sqlQuery.values).toEqual([until, from, providerId]);
    expect(sql).not.toContain('"phone"');
    expect(sql).not.toContain('"addressSnapshot"');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('returns an explicit empty provisional shortlist when no agent is available', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: bookingId, providerId, status: 'CONFIRMED', hasActiveAssignment: false, scheduledFrom: new Date(), scheduledUntil: new Date() }])
      .mockResolvedValueOnce([]);
    const response = await service.listDispatchCandidates(bookingId);
    expect(response.candidates).toEqual([]);
    expect(response.provisional).toBe(true);
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
    const { tx, prisma, push, service } = setup();
    const assignment = { id: assignmentId, bookingId, providerId, agentId, status: 'ASSIGNED' };
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: bookingId, userId: consumerUserId, providerId, status: 'CONFIRMED' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: agentId, providerId, displayName: 'Ravi', active: true }])
      .mockResolvedValueOnce([]) // No overlap under the agent row lock.
      .mockResolvedValueOnce([assignment]);
    tx.$executeRaw.mockResolvedValue(1);
    prisma.$queryRaw.mockResolvedValueOnce([{
      bookingId,
      userId: consumerUserId,
      offeringName: 'AC service',
      providerName: 'CoolCare',
      agentDisplayName: 'Ravi',
    }]);

    const result = await service.assign(actorUserId, bookingId, agentId);
    await vi.waitFor(() => expect(push.sendConsumerBookingEvent).toHaveBeenCalledOnce());

    expect(result.id).toBe(assignmentId);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(push.sendConsumerBookingEvent).toHaveBeenCalledWith(expect.objectContaining({
      bookingId,
      userId: consumerUserId,
      status: 'ASSIGNED',
    }));
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


  it('blocks direct assignment when the selected agent has an overlapping active job', async () => {
    const { tx, service } = setup();
    const from = new Date('2030-01-01T10:00:00Z'), until = new Date('2030-01-01T11:00:00Z');
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: bookingId, userId: consumerUserId, providerId, status: 'CONFIRMED', scheduledFrom: from, scheduledUntil: until }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: agentId, providerId, active: true }])
      .mockResolvedValueOnce([{ id: '88888888-8888-4888-8888-888888888888' }]);
    await expect(service.assign(actorUserId, bookingId, agentId)).rejects.toThrow('overlapping active service assignment');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(4);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    const agentLock = tx.$queryRaw.mock.calls[2][0] as { strings: string[] };
    expect(agentLock.strings.join(' ')).toContain('FOR UPDATE OF ag');
    const overlap = tx.$queryRaw.mock.calls[3][0] as { strings: string[]; values: unknown[] };
    expect(overlap.strings.join(' ')).toContain('other."scheduledFrom"');
    expect(overlap.strings.join(' ')).toContain('other."scheduledUntil"');
    expect(overlap.values).toEqual([agentId, providerId, until, from]);
  });

  it('one-action dispatch only selects a candidate without a reported conflict', async () => {
    const { prisma, tx, service } = setup();
    const from = new Date('2030-01-01T10:00:00Z'), until = new Date('2030-01-01T11:00:00Z');
    prisma.$queryRaw.mockResolvedValueOnce([{
      id: bookingId, providerId, status: 'CONFIRMED', hasActiveAssignment: false,
      scheduledFrom: from, scheduledUntil: until,
    }]).mockResolvedValueOnce([
      { agentId: '77777777-7777-4777-8777-777777777777', displayName: 'Busy', activeAssignmentCount: 2, hasScheduleConflict: true },
      { agentId, displayName: 'Ravi', activeAssignmentCount: 0, hasScheduleConflict: false },
    ]);
    const assignment = { id: assignmentId, bookingId, providerId, agentId, status: 'ASSIGNED' };
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: bookingId, userId: consumerUserId, providerId, status: 'CONFIRMED', scheduledFrom: from, scheduledUntil: until }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: agentId, providerId, active: true }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([assignment]);
    // The post-commit notification query may return no recipients in this isolated test.
    prisma.$queryRaw.mockResolvedValueOnce([]);
    const result = await service.quickDispatch(actorUserId, bookingId);
    expect(result.agentId).toBe(agentId);
    expect(tx.$queryRaw.mock.calls[2][0].values).toContain(agentId);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('fails without writing if all provisional candidates have conflicts', async () => {
    const { prisma, tx, service } = setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: bookingId, providerId, status: 'CONFIRMED', hasActiveAssignment: false, scheduledFrom: new Date(), scheduledUntil: new Date() }])
      .mockResolvedValueOnce([{ agentId, displayName: 'Ravi', activeAssignmentCount: 1, hasScheduleConflict: true }]);
    await expect(service.quickDispatch(actorUserId, bookingId)).rejects.toThrow('No conflict-free provider agent currently available');
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
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

  it('notifies the consumer after an en-route transition commits', async () => {
    const { tx, prisma, push, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: assignmentId, bookingId, providerId, agentId, status: 'ACCEPTED' }])
      .mockResolvedValueOnce([{ id: assignmentId, bookingId, providerId, agentId, status: 'EN_ROUTE' }]);
    tx.$executeRaw.mockResolvedValue(1);
    prisma.$queryRaw.mockResolvedValueOnce([{
      bookingId,
      userId: consumerUserId,
      offeringName: 'AC service',
      providerName: 'CoolCare',
      agentDisplayName: 'Ravi',
    }]);

    const result = await service.transition(actorUserId, assignmentId, 'EN_ROUTE');
    await vi.waitFor(() => expect(push.sendConsumerBookingEvent).toHaveBeenCalledOnce());

    expect(result.status).toBe('EN_ROUTE');
    expect(push.sendConsumerBookingEvent).toHaveBeenCalledWith(expect.objectContaining({ status: 'EN_ROUTE' }));
  });
});
