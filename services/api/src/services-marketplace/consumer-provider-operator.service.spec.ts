import { describe, expect, it, vi } from 'vitest';
import { ConsumerProviderOperatorService } from './consumer-provider-operator.service';

function sqlValues(call: unknown): unknown[] {
  return (call as { values?: unknown[] }).values ?? [];
}

function setup() {
  const prisma = {
    $queryRaw: vi.fn(),
    serviceProvider: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    serviceOffering: { findMany: vi.fn(), findFirst: vi.fn() },
  };
  const availability = {
    listServiceAreas: vi.fn(),
    addServiceArea: vi.fn(),
    setServiceAreaActive: vi.fn(),
  };
  const locations = {
    listOfferingServiceAreas: vi.fn(),
    addOfferingServiceArea: vi.fn(),
    setOfferingServiceAreaActive: vi.fn(),
  };
  return {
    prisma,
    availability,
    locations,
    service: new ConsumerProviderOperatorService(
      prisma as unknown as ConstructorParameters<typeof ConsumerProviderOperatorService>[0],
      availability as unknown as ConstructorParameters<typeof ConsumerProviderOperatorService>[1],
      locations as unknown as ConstructorParameters<typeof ConsumerProviderOperatorService>[2],
    ),
  };
}

describe('ConsumerProviderOperatorService', () => {
  it('rejects users without exactly one active provider mapping', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(service.resolveProvider('11111111-1111-1111-1111-111111111111')).rejects.toThrow('Provider operator access is not available');
    expect(sqlValues(prisma.$queryRaw.mock.calls[0][0])).toContain('11111111-1111-1111-1111-111111111111');
  });

  it('rejects inactive or unverified providers', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValue([{ id: '1', providerId: '2', userId: '3', active: true, businessName: 'Provider', verification: 'PENDING', providerActive: true }]);
    await expect(service.resolveProvider('33333333-3333-3333-3333-333333333333')).rejects.toThrow('Provider must be active and verified');
  });

  it('scopes service-area mutation to the authenticated provider mapping', async () => {
    const { prisma, availability, service } = setup();
    prisma.$queryRaw.mockResolvedValue([{ id: '1', providerId: '22222222-2222-2222-2222-222222222222', userId: '3', active: true, businessName: 'Provider', verification: 'VERIFIED', providerActive: true }]);
    availability.addServiceArea.mockResolvedValue({ id: 'area' });
    await service.addMyServiceArea('33333333-3333-3333-3333-333333333333', '560038');
    expect(availability.addServiceArea).toHaveBeenCalledWith('22222222-2222-2222-2222-222222222222', '560038');
  });

  it('cannot manage an offering owned by another provider', async () => {
    const { prisma, locations, service } = setup();
    prisma.$queryRaw.mockResolvedValue([{ id: '1', providerId: '22222222-2222-2222-2222-222222222222', userId: '3', active: true, businessName: 'Provider', verification: 'VERIFIED', providerActive: true }]);
    prisma.serviceOffering.findFirst.mockResolvedValue(null);
    await expect(service.addMyOfferingArea('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', '560038')).rejects.toThrow('Provider offering not found');
    expect(locations.addOfferingServiceArea).not.toHaveBeenCalled();
  });
});
