import { describe, expect, it, vi } from 'vitest';
import { ConsumerServiceCompletionService } from './consumer-service-completion.service';

function sqlValues(call: unknown): unknown[] {
  return (call as { values?: unknown[] }).values ?? [];
}

function setup() {
  const tx = { $queryRaw: vi.fn(), $executeRaw: vi.fn() };
  const prisma = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const agents = {
    resolveAgent: vi.fn().mockResolvedValue({
      identityId: '11111111-1111-1111-1111-111111111111',
      agentId: '22222222-2222-2222-2222-222222222222',
      userId: '33333333-3333-3333-3333-333333333333',
      providerId: '44444444-4444-4444-4444-444444444444',
      displayName: 'Ravi',
      businessName: 'Provider',
    }),
  };
  const push = { sendConsumerBookingEvent: vi.fn().mockResolvedValue(undefined) };
  const service = new ConsumerServiceCompletionService(
    prisma as unknown as ConstructorParameters<typeof ConsumerServiceCompletionService>[0],
    agents as unknown as ConstructorParameters<typeof ConsumerServiceCompletionService>[1],
    push as unknown as ConstructorParameters<typeof ConsumerServiceCompletionService>[2],
  );
  return { tx, prisma, agents, push, service };
}

describe('ConsumerServiceCompletionService', () => {
  it('starts service only from an arrived assignment owned by the authenticated agent', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: '55555555-5555-5555-5555-555555555555', bookingId: '66666666-6666-6666-6666-666666666666', providerId: '44444444-4444-4444-4444-444444444444', agentId: '22222222-2222-2222-2222-222222222222', status: 'ARRIVED' }])
      .mockResolvedValueOnce([{ id: '66666666-6666-6666-6666-666666666666', userId: '77777777-7777-7777-7777-777777777777', providerId: '44444444-4444-4444-4444-444444444444', offeringId: '99999999-9999-4999-8999-999999999999', status: 'CONFIRMED' }])
      .mockResolvedValueOnce([{ id: '66666666-6666-6666-6666-666666666666', status: 'IN_PROGRESS' }]);
    await service.startByAgent('33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555');
    expect(sqlValues(tx.$queryRaw.mock.calls[0][0])).toEqual(expect.arrayContaining(['55555555-5555-5555-5555-555555555555','22222222-2222-2222-2222-222222222222','44444444-4444-4444-4444-444444444444']));
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('makes completion request idempotent while booking remains in progress', async () => {
    const { tx, push, service } = setup();
    const occurredAt = new Date('2026-09-07T12:00:00Z');
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: '55555555-5555-5555-5555-555555555555', bookingId: '66666666-6666-6666-6666-666666666666', providerId: '44444444-4444-4444-4444-444444444444', agentId: '22222222-2222-2222-2222-222222222222', status: 'ARRIVED' }])
      .mockResolvedValueOnce([{ id: '66666666-6666-6666-6666-666666666666', userId: '77777777-7777-7777-7777-777777777777', providerId: '44444444-4444-4444-4444-444444444444', offeringId: '99999999-9999-4999-8999-999999999999', status: 'IN_PROGRESS' }])
      .mockResolvedValueOnce([{ occurredAt }])
      .mockResolvedValueOnce([]); // legacy/no checklist: preserve completion retries
    const result = await service.requestCompletionByAgent('33333333-3333-3333-3333-333333333333','55555555-5555-5555-5555-555555555555');
    expect(result).toEqual({ assignmentId: '55555555-5555-5555-5555-555555555555', bookingId: '66666666-6666-6666-6666-666666666666', status: 'PENDING', requestedAt: occurredAt });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(push.sendConsumerBookingEvent).not.toHaveBeenCalled();
  });

  it('notifies the booking owner only after a new completion request is committed', async () => {
    const { tx, prisma, push, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: '55555555-5555-5555-5555-555555555555', bookingId: '66666666-6666-6666-6666-666666666666', providerId: '44444444-4444-4444-4444-444444444444', agentId: '22222222-2222-2222-2222-222222222222', status: 'ARRIVED' }])
      .mockResolvedValueOnce([{ id: '66666666-6666-6666-6666-666666666666', userId: '77777777-7777-7777-7777-777777777777', providerId: '44444444-4444-4444-4444-444444444444', offeringId: '99999999-9999-4999-8999-999999999999', status: 'IN_PROGRESS' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]); // legacy/no checklist
    tx.$executeRaw.mockResolvedValue(1);
    prisma.$queryRaw.mockResolvedValueOnce([{ userId: '77777777-7777-7777-7777-777777777777', bookingId: '66666666-6666-6666-6666-666666666666', offeringName: 'AC service', providerName: 'CoolCare', agentDisplayName: 'Ravi' }]);
    await service.requestCompletionByAgent('33333333-3333-3333-3333-333333333333','55555555-5555-5555-5555-555555555555');
    await vi.waitFor(() => expect(push.sendConsumerBookingEvent).toHaveBeenCalledWith(expect.objectContaining({ userId: '77777777-7777-7777-7777-777777777777', bookingId: '66666666-6666-6666-6666-666666666666', status: 'COMPLETION_REQUESTED' })));
  });

  it('customer confirmation atomically completes booking, releases assignment, and snapshots warranty terms', async () => {
    const { tx, service } = setup();
    const offeringId = '99999999-9999-4999-8999-999999999999';
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: '66666666-6666-6666-6666-666666666666', userId: '77777777-7777-7777-7777-777777777777', providerId: '44444444-4444-4444-4444-444444444444', offeringId, status: 'IN_PROGRESS' }])
      .mockResolvedValueOnce([{ id: '55555555-5555-5555-5555-555555555555', bookingId: '66666666-6666-6666-6666-666666666666', providerId: '44444444-4444-4444-4444-444444444444', agentId: '22222222-2222-2222-2222-222222222222', status: 'ARRIVED' }])
      .mockResolvedValueOnce([{ id: '88888888-8888-8888-8888-888888888888' }])
      .mockResolvedValueOnce([]) // legacy/no checklist
      .mockResolvedValueOnce([{ id: '66666666-6666-6666-6666-666666666666', status: 'COMPLETED' }])
      .mockResolvedValueOnce([{ id: '55555555-5555-5555-5555-555555555555', bookingId: '66666666-6666-6666-6666-666666666666', providerId: '44444444-4444-4444-4444-444444444444', agentId: '22222222-2222-2222-2222-222222222222', status: 'RELEASED' }]);
    tx.$executeRaw.mockResolvedValue(1);
    await service.confirmByConsumer('77777777-7777-7777-7777-777777777777', '66666666-6666-6666-6666-666666666666');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(3);
    expect(sqlValues(tx.$executeRaw.mock.calls[2][0])).toEqual(expect.arrayContaining([
      '66666666-6666-6666-6666-666666666666',
      offeringId,
    ]));
  });


  it('rejects required evidence missing from the active assignment and does not send completion', async () => {
    const { tx, push, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: '55555555-5555-5555-5555-555555555555', bookingId: '66666666-6666-6666-6666-666666666666', providerId: '44444444-4444-4444-4444-444444444444', agentId: '22222222-2222-2222-2222-222222222222', status: 'ARRIVED' }])
      .mockResolvedValueOnce([{ id: '66666666-6666-6666-6666-666666666666', status: 'IN_PROGRESS' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ items: [{ id: 'inspect_filter', required: true }, { id: 'clean_area', required: false }] }])
      .mockResolvedValueOnce([]);
    await expect(service.requestCompletionByAgent('33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555'))
      .rejects.toThrow('All required quality checklist checks must pass');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(push.sendConsumerBookingEvent).not.toHaveBeenCalled();
    const evidence = tx.$queryRaw.mock.calls[4][0] as { strings: string[]; values: unknown[] };
    expect(evidence.strings.join(' ')).toContain('DISTINCT ON ("itemId")');
    expect(evidence.values).toContain('55555555-5555-5555-5555-555555555555');
  });

  it('rejects a stale completion request retry after the required check changes to failed', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: '55555555-5555-5555-5555-555555555555', bookingId: '66666666-6666-6666-6666-666666666666', providerId: '44444444-4444-4444-4444-444444444444', agentId: '22222222-2222-2222-2222-222222222222', status: 'ARRIVED' }])
      .mockResolvedValueOnce([{ id: '66666666-6666-6666-6666-666666666666', status: 'IN_PROGRESS' }])
      .mockResolvedValueOnce([{ occurredAt: new Date() }])
      .mockResolvedValueOnce([{ items: [{ id: 'inspect_filter', required: true }] }])
      .mockResolvedValueOnce([{ itemId: 'inspect_filter', passed: false }]);
    await expect(service.requestCompletionByAgent('33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555'))
      .rejects.toThrow('All required quality checklist checks must pass');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('accepts passing required assessments without requiring optional item evidence', async () => {
    const { tx, prisma, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: '55555555-5555-5555-5555-555555555555', bookingId: '66666666-6666-6666-6666-666666666666', providerId: '44444444-4444-4444-4444-444444444444', agentId: '22222222-2222-2222-2222-222222222222', status: 'ARRIVED' }])
      .mockResolvedValueOnce([{ id: '66666666-6666-6666-6666-666666666666', status: 'IN_PROGRESS' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ items: [{ id: 'inspect_filter', required: true }, { id: 'clean_area', required: false }] }])
      .mockResolvedValueOnce([{ itemId: 'inspect_filter', passed: true }]);
    prisma.$queryRaw.mockResolvedValue([]);
    const result = await service.requestCompletionByAgent('33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555');
    expect(result.status).toBe('PENDING');
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });

  it('rechecks failed required evidence before consumer completion without releasing assignment', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: '66666666-6666-6666-6666-666666666666', userId: '77777777-7777-7777-7777-777777777777', offeringId: '99999999-9999-4999-8999-999999999999', status: 'IN_PROGRESS' }])
      .mockResolvedValueOnce([{ id: '55555555-5555-5555-5555-555555555555', bookingId: '66666666-6666-6666-6666-666666666666', status: 'ARRIVED' }])
      .mockResolvedValueOnce([{ id: '88888888-8888-8888-8888-888888888888' }])
      .mockResolvedValueOnce([{ items: [{ id: 'inspect_filter', required: true }] }])
      .mockResolvedValueOnce([{ itemId: 'inspect_filter', passed: false }]);
    await expect(service.confirmByConsumer('77777777-7777-7777-7777-777777777777','66666666-6666-6666-6666-666666666666'))
      .rejects.toThrow('All required quality checklist checks must pass');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    const evidence = tx.$queryRaw.mock.calls[4][0] as { strings: string[]; values: unknown[] };
    expect(evidence.strings.join(' ')).toContain('"assignmentId"');
    expect(evidence.values).toContain('55555555-5555-5555-5555-555555555555');
  });

  it('does not let a customer confirm before the provider agent requests completion', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: '66666666-6666-6666-6666-666666666666', userId: '77777777-7777-7777-7777-777777777777', providerId: '44444444-4444-4444-4444-444444444444', offeringId: '99999999-9999-4999-8999-999999999999', status: 'IN_PROGRESS' }])
      .mockResolvedValueOnce([{ id: '55555555-5555-5555-5555-555555555555', bookingId: '66666666-6666-6666-6666-666666666666', providerId: '44444444-4444-4444-4444-444444444444', agentId: '22222222-2222-2222-2222-222222222222', status: 'ARRIVED' }])
      .mockResolvedValueOnce([]);
    await expect(service.confirmByConsumer('77777777-7777-7777-7777-777777777777','66666666-6666-6666-6666-666666666666')).rejects.toThrow('Provider agent has not requested completion');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
