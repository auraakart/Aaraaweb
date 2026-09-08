import { describe, expect, it, vi } from 'vitest';
import { ConsumerServiceLocationService } from './consumer-service-location.service';

function setup() {
  const prisma = {
    $queryRaw: vi.fn(),
    society: { findUnique: vi.fn() },
    serviceOffering: { findUnique: vi.fn() },
  };
  return {
    prisma,
    service: new ConsumerServiceLocationService(
      prisma as unknown as ConstructorParameters<typeof ConsumerServiceLocationService>[0],
    ),
  };
}

function sqlValues(call: unknown): unknown[] {
  return (call as { values?: unknown[] }).values ?? [];
}

const userId = '11111111-1111-1111-1111-111111111111';
const unitId = '22222222-2222-2222-2222-222222222222';
const offeringId = '33333333-3333-3333-3333-333333333333';

describe('ConsumerServiceLocationService', () => {
  it('scopes society-unit location resolution to the authenticated user relationship', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValue([]);

    await expect(service.resolveLocation(userId, 'SOCIETY_UNIT', unitId)).rejects.toThrow(
      'Service-ready society unit not found',
    );

    const values = sqlValues(prisma.$queryRaw.mock.calls[0][0]);
    expect(values).toContain(userId);
    expect(values).toContain(unitId);
  });

  it('uses the resolved postal code when filtering serviceable offerings', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([{
        type: 'SOCIETY_UNIT', id: unitId, homeId: null, societyUnitId: unitId,
        societyId: '44444444-4444-4444-4444-444444444444', label: 'Aaraa Heights · A 101',
        addressLine1: 'A 101, Main Road', addressLine2: null, locality: 'Indiranagar', city: 'Bengaluru',
        state: 'Karnataka', postalCode: '560038', latitude: null, longitude: null,
      }])
      .mockResolvedValueOnce([]);

    await service.listServiceableOfferings(userId, 'SOCIETY_UNIT', unitId, offeringId);

    const values = sqlValues(prisma.$queryRaw.mock.calls[1][0]);
    expect(values).toContain('560038');
    expect(values).toContain(offeringId);
  });

  it('normalizes offering service-area PIN codes before persistence', async () => {
    const { prisma, service } = setup();
    prisma.serviceOffering.findUnique.mockResolvedValue({ id: offeringId });
    prisma.$queryRaw.mockResolvedValue([{ id: 'area-1', postalCode: '560038', active: true }]);

    await service.addOfferingServiceArea(offeringId, '560 038');

    const values = sqlValues(prisma.$queryRaw.mock.calls[0][0]);
    expect(values).toContain('560038');
  });
});
