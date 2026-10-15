import { describe, expect, it, vi } from 'vitest';
import { ConsumerProviderOperatorService } from './consumer-provider-operator.service';

function sqlValues(call: unknown): unknown[] {
  return (call as { values?: unknown[] }).values ?? [];
}

function setup() {
  const tx = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
  };
  const prisma = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(async (fn: (transaction: typeof tx) => unknown) => fn(tx)),
    serviceProvider: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    serviceOffering: { findMany: vi.fn(), findFirst: vi.fn() },
  };
  const availability = {};
  const locations = {};
  const fulfilment = {};
  const dispatch = {};
  const service = new ConsumerProviderOperatorService(
    prisma as unknown as ConstructorParameters<typeof ConsumerProviderOperatorService>[0],
    availability as unknown as ConstructorParameters<typeof ConsumerProviderOperatorService>[1],
    locations as unknown as ConstructorParameters<typeof ConsumerProviderOperatorService>[2],
    fulfilment as unknown as ConstructorParameters<typeof ConsumerProviderOperatorService>[3],
    dispatch as unknown as ConstructorParameters<typeof ConsumerProviderOperatorService>[4],
  );
  return { prisma, tx, service };
}

const providerId = '22222222-2222-2222-2222-222222222222';
const otherProviderId = '44444444-4444-4444-4444-444444444444';
const userId = '33333333-3333-3333-3333-333333333333';

describe('ConsumerProviderOperatorService hardening', () => {
  it('rejects linking a user who already has another active provider mapping', async () => {
    const { prisma, tx, service } = setup();
    prisma.serviceProvider.findUnique.mockResolvedValue({ id: providerId });
    prisma.user.findUnique.mockResolvedValue({ id: userId });
    tx.$queryRaw.mockResolvedValue([{ providerId: otherProviderId }]);

    await expect(service.linkOperator(providerId, userId)).rejects.toThrow(
      'User already has an active provider operator mapping',
    );

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('allows idempotent linking to the same active provider', async () => {
    const { prisma, tx, service } = setup();
    prisma.serviceProvider.findUnique.mockResolvedValue({ id: providerId });
    prisma.user.findUnique.mockResolvedValue({ id: userId });
    tx.$queryRaw
      .mockResolvedValueOnce([{ providerId }])
      .mockResolvedValueOnce([{ id: '55555555-5555-5555-5555-555555555555', providerId, userId, active: true }]);

    await expect(service.linkOperator(providerId, userId)).resolves.toMatchObject({ providerId, userId, active: true });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('revokes only the requested provider-user mapping', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValue([{ id: '55555555-5555-5555-5555-555555555555', providerId, userId, active: false }]);

    await expect(service.revokeOperator(providerId, userId)).resolves.toMatchObject({ active: false });
    expect(sqlValues(prisma.$queryRaw.mock.calls[0][0])).toEqual(expect.arrayContaining([providerId, userId]));
  });

  it('fails revocation when no active mapping exists', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(service.revokeOperator(providerId, userId)).rejects.toThrow('Active provider operator mapping not found');
  });
});
