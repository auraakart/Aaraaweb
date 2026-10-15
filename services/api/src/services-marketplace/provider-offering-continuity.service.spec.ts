import { describe, expect, it, vi } from 'vitest';
import { ProviderOfferingContinuityService } from './provider-offering-continuity.service';

function setup() {
  const prisma = {
    $queryRaw: vi.fn(),
    serviceOffering: { findFirst: vi.fn() },
  };
  const operators = {
    resolveProvider: vi.fn(),
  };
  return {
    prisma,
    operators,
    service: new ProviderOfferingContinuityService(
      prisma as unknown as ConstructorParameters<typeof ProviderOfferingContinuityService>[0],
      operators as unknown as ConstructorParameters<typeof ProviderOfferingContinuityService>[1],
    ),
  };
}

describe('ProviderOfferingContinuityService', () => {
  it('writes continuity metadata only after proving offering ownership', async () => {
    const { prisma, operators, service } = setup();
    operators.resolveProvider.mockResolvedValue({ providerId: '22222222-2222-4222-8222-222222222222' });
    prisma.serviceOffering.findFirst.mockResolvedValue({ id: '33333333-3333-4333-8333-333333333333' });
    prisma.$queryRaw.mockResolvedValue([{
      offeringId: '33333333-3333-4333-8333-333333333333',
      warrantyDays: 30,
      revisitPolicy: 'One revisit for the same issue within the warranty period.',
      updatedAt: new Date(),
    }]);

    const result = await service.setMyPolicy(
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
      { warrantyDays: 30, revisitPolicy: '  One revisit for the same issue within the warranty period.  ' },
    );

    expect(operators.resolveProvider).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    expect(prisma.serviceOffering.findFirst).toHaveBeenCalledWith({
      where: {
        id: '33333333-3333-4333-8333-333333333333',
        providerId: '22222222-2222-4222-8222-222222222222',
      },
      select: { id: true },
    });
    expect(result.warrantyDays).toBe(30);
    expect(result.revisitPolicy).toBe('One revisit for the same issue within the warranty period.');
  });

  it('blocks continuity-policy access for another providers offering', async () => {
    const { prisma, operators, service } = setup();
    operators.resolveProvider.mockResolvedValue({ providerId: '22222222-2222-4222-8222-222222222222' });
    prisma.serviceOffering.findFirst.mockResolvedValue(null);

    await expect(service.setMyPolicy(
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
      { warrantyDays: 15 },
    )).rejects.toThrow('Provider offering not found');

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
