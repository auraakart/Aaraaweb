import { describe, expect, it, vi } from 'vitest';
import { ConsumerServiceCompletionService } from './consumer-service-completion.service';

function sqlValues(call: unknown): unknown[] {
  return (call as { values?: unknown[] }).values ?? [];
}

function setup() {
  const tx = {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  };
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
  const service = new ConsumerServiceCompletionService(
    prisma as unknown as ConstructorParameters<typeof ConsumerServiceCompletionService>[0],
    agents as unknown as ConstructorParameters<typeof ConsumerServiceCompletionService>[1],
  );
  return { tx, prisma, agents, service };
}

describe('ConsumerServiceCompletionService', () => {
  it('starts service only from an arrived assignment owned by the authenticated agent', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: '55555555-5555-5555-5555-555555555555', bookingId: '66666666-6666-6666-6666-666666666666', providerId: '44444444-4444-4444-4444-444444444444', agentId: '22222222-2222-2222-2222-222222222222', status: 'ARRIVED' }])
      .mockResolvedValueOnce([{ id: '66666666-6666-6666-6666-666666666666', userId: '77777777-7777-7777-7777-777777777777', providerId: '44444444-4444-4444-4444-444444444444', status: 'CONFIRMED' }])
      .mockResolvedValueOnce([{ id: '66666666-6666-6666-6666-666666666666', status: 'IN_PROGRESS' }]);

    await service.startByAgent('33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555');

    expect(sqlValues(tx.$queryRaw.mock.calls[0][0])).toEqual(expect.arrayContaining([
      '55555555-5555-5555-5555-555555555555',
      '22222222-2222-2222-2222-222222222222',
      '44444444-4444-4444-4444-444444444444',
    ]));
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('makes completion request idempotent while booking remains in progress', async () => {
    const { tx, service } = setup();
    const occurredAt = new Date('2026-09-07T12:00:00Z');
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: '55555555-5555-5555-5555-555555555555', bookingId: '66666666-6666-6666-6666-666666666666', providerId: '44444444-4444-4444-4444-444444444444', agentId: '22222222-2222-2222-2222-222222222222', status: 'ARRIVED' }])
      .mockResolvedValueOnce([{ id: '66666666-6666-6666-6666-666666666666', userId: '77777777-7777-7777-7777-777777777777', providerId: '44444444-4444-4444-4444-444444444444', status: 'IN_PROGRESS' }])
      .mockResolvedValueOnce([{ occurredAt }]);

    const result = await service.requestCompletionByAgent(
      '33333333-3333-3333-3333-333333333333',
      '55555555-5555-5555-5555-555555555555',
    );

    expect(result).toEqual({
      assignmentId: '55555555-5555-5555-5555-555555555555',
      bookingId: '66666666-6666-6666-6666-666666666666',
      status: 'PENDING',
      requestedAt: occurredAt,
    });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('customer confirmation atomically completes booking and releases arrived assignment', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: '66666666-6666-6666-6666-666666666666', userId: '77777777-7777-7777-7777-777777777777', providerId: '44444444-4444-4444-4444-444444444444', status: 'IN_PROGRESS' }])
      .mockResolvedValueOnce([{ id: '55555555-5555-5555-5555-555555555555', bookingId: '66666666-6666-6666-6666-666666666666', providerId: '44444444-4444-4444-4444-444444444444', agentId: '22222222-2222-2222-2222-222222222222', status: 'ARRIVED' }])
      .mockResolvedValueOnce([{ id: '88888888-8888-8888-8888-888888888888' }])
      .mockResolvedValueOnce([{ id: '66666666-6666-6666-6666-666666666666', status: 'COMPLETED' }])
      .mockResolvedValueOnce([{ id: '55555555-5555-5555-5555-555555555555', bookingId: '66666666-6666-6666-6666-666666666666', providerId: '44444444-4444-4444-4444-444444444444', agentId: '22222222-2222-2222-2222-222222222222', status: 'RELEASED' }]);

    await service.confirmByConsumer('77777777-7777-7777-7777-777777777777', '66666666-6666-6666-6666-666666666666');

    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(sqlValues(tx.$queryRaw.mock.calls[0][0])).toEqual(expect.arrayContaining([
      '66666666-6666-6666-6666-666666666666',
      '77777777-7777-7777-7777-777777777777',
    ]));
  });

  it('does not let a customer confirm before the provider agent requests completion', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: '66666666-6666-6666-6666-666666666666', userId: '77777777-7777-7777-7777-777777777777', providerId: '44444444-4444-4444-4444-444444444444', status: 'IN_PROGRESS' }])
      .mockResolvedValueOnce([{ id: '55555555-5555-5555-5555-555555555555', bookingId: '66666666-6666-6666-6666-666666666666', providerId: '44444444-4444-4444-4444-444444444444', agentId: '22222222-2222-2222-2222-222222222222', status: 'ARRIVED' }])
      .mockResolvedValueOnce([]);

    await expect(service.confirmByConsumer(
      '77777777-7777-7777-7777-777777777777',
      '66666666-6666-6666-6666-666666666666',
    )).rejects.toThrow('Provider agent has not requested completion');

    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
