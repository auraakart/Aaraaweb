import { describe, expect, it, vi } from 'vitest';
import { ServicesMarketplaceService } from './services-marketplace.service';

function setup() {
  const prisma = {
    unitOccupancy: { findFirst: vi.fn().mockResolvedValue({ id: 'link-1' }) },
    serviceOffering: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    serviceBooking: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    serviceProvider: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    serviceProviderSociety: { upsert: vi.fn() },
    serviceCategory: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    serviceRating: { create: vi.fn() },
  };
  const entitlements = { isEnabled: vi.fn().mockResolvedValue(true) };
  const access = {
    create: vi.fn().mockResolvedValue({ id: 'access-1' }),
    approve: vi.fn().mockResolvedValue({ request: { id: 'access-1' }, credential: 'raw-pass' }),
    cancel: vi.fn(),
  };
  const operations = {
    assertProviderAvailable: vi.fn().mockResolvedValue(undefined),
    enrichOfferings: vi.fn().mockImplementation(async (_societyId: string, offerings: unknown[]) => offerings),
    setPlatformVerification: vi.fn(),
  };
  return {
    prisma,
    entitlements,
    access,
    operations,
    service: new ServicesMarketplaceService(
      prisma as unknown as ConstructorParameters<typeof ServicesMarketplaceService>[0],
      entitlements as unknown as ConstructorParameters<typeof ServicesMarketplaceService>[1],
      access as unknown as ConstructorParameters<typeof ServicesMarketplaceService>[2],
      operations as unknown as ConstructorParameters<typeof ServicesMarketplaceService>[3],
    ),
  };
}

describe('ServicesMarketplaceService', () => {
  it('snapshots price and commission when a resident books after availability validation', async () => {
    const { prisma, operations, service } = setup();
    prisma.serviceOffering.findFirst.mockResolvedValue({
      id: 'offering-1',
      providerId: 'provider-1',
      pricePaise: 200000,
      provider: { societies: [{ commissionBps: 1250 }] },
    });
    prisma.serviceBooking.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(data));

    const scheduledFrom = new Date('2026-09-02T10:00:00Z');
    const scheduledUntil = new Date('2026-09-02T12:00:00Z');
    const result = await service.book('society-1', 'user-1', 'unit-1', 'offering-1', scheduledFrom, scheduledUntil);

    expect(operations.assertProviderAvailable).toHaveBeenCalledWith('society-1', 'offering-1', scheduledFrom, scheduledUntil);
    expect(result.servicePricePaise).toBe(200000);
    expect(result.commissionBps).toBe(1250);
    expect(result.commissionPaise).toBe(25000);
  });

  it('creates and approves a service-provider access request when booking is confirmed', async () => {
    const { prisma, access, service } = setup();
    prisma.serviceBooking.findFirst.mockResolvedValue({
      id: 'booking-1', societyId: 'society-1', unitId: 'unit-1', residentUserId: 'user-1',
      providerId: 'provider-1', offeringId: 'offering-1', status: 'REQUESTED',
      scheduledFrom: new Date('2026-09-02T10:00:00Z'), scheduledUntil: new Date('2026-09-02T12:00:00Z'),
      provider: { businessName: 'Aaraa Plumbing', phone: '9999999999' }, offering: { name: 'Pipe repair' },
    });
    prisma.serviceBooking.update.mockResolvedValue({ id: 'booking-1', status: 'CONFIRMED', accessRequestId: 'access-1' });

    const result = await service.confirm('society-1', 'booking-1');
    expect(access.create).toHaveBeenCalledWith('society-1', 'user-1', 'unit-1', 'SERVICE_PROVIDER', 'Aaraa Plumbing', '9999999999', 'Pipe repair', expect.objectContaining({ bookingId: 'booking-1' }));
    expect(access.approve).toHaveBeenCalled();
    expect(result.accessCredential).toBe('raw-pass');
  });

  it('rejects marketplace use when the society feature is disabled', async () => {
    const { entitlements, service } = setup();
    entitlements.isEnabled.mockResolvedValue(false);
    await expect(service.listOfferings('society-1')).rejects.toThrow('not enabled');
  });

  it('enriches resident offerings with provider reputation metrics', async () => {
    const { prisma, operations, service } = setup();
    const offerings = [{ id: 'offering-1', providerId: 'provider-1', provider: { id: 'provider-1', businessName: 'CoolCare' } }];
    prisma.serviceOffering.findMany.mockResolvedValue(offerings);
    operations.enrichOfferings.mockResolvedValue([{ ...offerings[0], provider: { ...offerings[0].provider, ratingAverage: 4.8, ratingCount: 12, completedJobs: 47 } }]);

    const result = await service.listOfferings('society-1');

    expect(operations.enrichOfferings).toHaveBeenCalledWith('society-1', offerings);
    expect(result[0].provider).toMatchObject({ ratingAverage: 4.8, ratingCount: 12, completedJobs: 47 });
  });

  it('lists the admin booking queue only for the current society', async () => {
    const { prisma, service } = setup();
    prisma.serviceBooking.findMany.mockResolvedValue([]);
    await service.listAdminBookings('society-1');
    expect(prisma.serviceBooking.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { societyId: 'society-1' } }));
  });

  it('minimizes provider PII and linked gate data in resident booking history', async () => {
    const { prisma, service } = setup();
    prisma.serviceBooking.findMany.mockResolvedValue([]);
    await service.listMine('society-1', 'resident-1');
    const query = prisma.serviceBooking.findMany.mock.calls[0][0];
    expect(query.include.provider.select).not.toHaveProperty('phone');
    expect(query.include.provider.select).not.toHaveProperty('email');
    expect(query.include.accessRequest.select).not.toHaveProperty('credentialHash');
    expect(query.include.accessRequest.select).not.toHaveProperty('metadata');
    expect(query.include.accessRequest.select).not.toHaveProperty('subjectPhone');
  });

  it('keeps current-society pending submissions visible without exposing other societies pending providers', async () => {
    const { prisma, service } = setup();
    prisma.serviceCategory.findMany.mockResolvedValue([]);
    prisma.serviceProvider.findMany.mockResolvedValue([]);
    prisma.serviceOffering.findMany.mockResolvedValue([]);
    await service.adminCatalog('society-1');
    expect(prisma.serviceProvider.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { active: true, OR: [{ verification: 'VERIFIED' }, { societies: { some: { societyId: 'society-1' } } }] },
      include: { societies: { where: { societyId: 'society-1' }, take: 1 } },
    }));
  });

  it('redacts contact details for verified providers not yet linked to the current society', async () => {
    const { prisma, service } = setup();
    prisma.serviceCategory.findMany.mockResolvedValue([]);
    prisma.serviceProvider.findMany.mockResolvedValue([{ id: 'provider-1', businessName: 'Platform Provider', contactName: 'Contact', phone: '9999999999', email: 'p@example.com', verification: 'VERIFIED', societies: [] }]);
    prisma.serviceOffering.findMany.mockResolvedValue([]);
    const result = await service.adminCatalog('society-1');
    expect(result.providers[0]).toMatchObject({ contactName: null, phone: '', email: null });
  });

  it('creates a pending provider-to-society relationship when a society submits a provider', async () => {
    const { prisma, service } = setup();
    prisma.serviceProvider.create.mockResolvedValue({ id: 'provider-1' });
    await service.createProvider('society-1', { businessName: 'CoolCare', contactName: 'Rajesh', phone: '9999999999', email: 'service@example.com', description: 'AC servicing' });
    expect(prisma.serviceProvider.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ businessName: 'CoolCare', societies: { create: { societyId: 'society-1', status: 'PENDING' } } }),
      include: { societies: { where: { societyId: 'society-1' }, take: 1 } },
    }));
  });

  it('requires an approved provider relationship in the current society before creating an offering', async () => {
    const { prisma, service } = setup();
    prisma.serviceProvider.findFirst.mockResolvedValue(null);
    await expect(service.createOffering('society-1', 'provider-1', 'category-1', 'Pipe repair', 50000)).rejects.toThrow('Approved service provider');
  });
});
