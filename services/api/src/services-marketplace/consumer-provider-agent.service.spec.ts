import { describe, expect, it, vi } from 'vitest';
import { ConsumerProviderAgentService } from './consumer-provider-agent.service';

function sqlValues(call: unknown): unknown[] {
  return (call as { values?: unknown[] }).values ?? [];
}

function setup() {
  const prisma = { $queryRaw: vi.fn(), $transaction: vi.fn() };
  const dispatch = { listAssignmentEvents: vi.fn(), transition: vi.fn() };
  return {
    prisma,
    dispatch,
    service: new ConsumerProviderAgentService(
      prisma as unknown as ConstructorParameters<typeof ConsumerProviderAgentService>[0],
      dispatch as unknown as ConstructorParameters<typeof ConsumerProviderAgentService>[1],
    ),
  };
}

const identity = {
  identityId: '11111111-1111-1111-1111-111111111111',
  agentId: '22222222-2222-2222-2222-222222222222',
  userId: '33333333-3333-3333-3333-333333333333',
  providerId: '44444444-4444-4444-4444-444444444444',
  displayName: 'Agent',
  businessName: 'Provider',
};

describe('ConsumerProviderAgentService', () => {
  it('rejects users without exactly one active verified agent identity', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(service.resolveAgent(identity.userId)).rejects.toThrow('Provider agent access is not available');
    expect(sqlValues(prisma.$queryRaw.mock.calls[0][0])).toContain(identity.userId);
  });

  it('scopes assignment queue to the authenticated agent and provider', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([identity])
      .mockResolvedValueOnce([{ id: 'assignment' }]);

    await service.listMyAssignments(identity.userId);

    expect(sqlValues(prisma.$queryRaw.mock.calls[1][0])).toEqual(expect.arrayContaining([
      identity.agentId,
      identity.providerId,
    ]));
  });

  it('blocks access to another agents assignment', async () => {
    const { prisma, dispatch, service } = setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([identity])
      .mockResolvedValueOnce([]);

    await expect(service.transitionMyAssignment(
      identity.userId,
      '55555555-5555-5555-5555-555555555555',
      'EN_ROUTE',
    )).rejects.toThrow('Provider agent assignment not found');

    expect(dispatch.transition).not.toHaveBeenCalled();
  });

  it('allows only agent-owned operational dispatch transitions', async () => {
    const { prisma, dispatch, service } = setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([identity])
      .mockResolvedValueOnce([{ id: '55555555-5555-5555-5555-555555555555' }]);
    dispatch.transition.mockResolvedValue({ id: '55555555-5555-5555-5555-555555555555', status: 'ACCEPTED' });

    await service.transitionMyAssignment(
      identity.userId,
      '55555555-5555-5555-5555-555555555555',
      'ACCEPTED',
      'On the job',
    );

    expect(dispatch.transition).toHaveBeenCalledWith(
      identity.userId,
      '55555555-5555-5555-5555-555555555555',
      'ACCEPTED',
      'On the job',
    );
  });

  it('does not allow an agent to release assignments', async () => {
    const { dispatch, service } = setup();
    await expect(service.transitionMyAssignment(
      identity.userId,
      '55555555-5555-5555-5555-555555555555',
      'RELEASED',
    )).rejects.toThrow('Provider agent cannot perform this dispatch transition');
    expect(dispatch.transition).not.toHaveBeenCalled();
  });
});
