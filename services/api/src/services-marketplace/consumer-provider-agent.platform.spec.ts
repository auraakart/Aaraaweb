import { describe, expect, it, vi } from 'vitest';
import { ConsumerProviderAgentService } from './consumer-provider-agent.service';

function setup() {
  const tx = { $queryRaw: vi.fn() };
  const prisma = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const dispatch = { listAssignmentEvents: vi.fn(), transition: vi.fn() };
  return {
    tx,
    prisma,
    service: new ConsumerProviderAgentService(
      prisma as unknown as ConstructorParameters<typeof ConsumerProviderAgentService>[0],
      dispatch as unknown as ConstructorParameters<typeof ConsumerProviderAgentService>[1],
    ),
  };
}

describe('ConsumerProviderAgentService identity lifecycle', () => {
  it('links an active verified agent to an existing user', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: '33333333-3333-3333-3333-333333333333' }])
      .mockResolvedValueOnce([{ id: '22222222-2222-2222-2222-222222222222', providerId: '44444444-4444-4444-4444-444444444444' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'identity', agentId: '22222222-2222-2222-2222-222222222222', userId: '33333333-3333-3333-3333-333333333333', active: true }]);

    const result = await service.linkAgent(
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333',
    );

    expect(result).toMatchObject({ id: 'identity', active: true });
  });

  it('rejects a user already linked to another active agent', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: '33333333-3333-3333-3333-333333333333' }])
      .mockResolvedValueOnce([{ id: '22222222-2222-2222-2222-222222222222', providerId: '44444444-4444-4444-4444-444444444444' }])
      .mockResolvedValueOnce([{ id: 'old', agentId: '55555555-5555-5555-5555-555555555555', userId: '33333333-3333-3333-3333-333333333333' }]);

    await expect(service.linkAgent(
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333',
    )).rejects.toThrow('User is already linked to another active provider agent');
  });

  it('revokes only the exact active agent-user identity', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValue([{ id: 'identity', agentId: '22222222-2222-2222-2222-222222222222', userId: '33333333-3333-3333-3333-333333333333', active: false }]);

    const result = await service.revokeAgent(
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333',
    );

    expect(result).toMatchObject({ active: false });
  });
});
