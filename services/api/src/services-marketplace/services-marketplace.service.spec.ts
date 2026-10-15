import { describe, expect, it, vi } from 'vitest';
import { ServicesMarketplaceService } from './services-marketplace.service';

function setup() {
  const prisma: Record<string, unknown> = {
    unitOccupancy: { findFirst: vi.fn().mockResolvedValue({ id: 'link-1' }) },
    unitOwnership: { findFirst: vi.fn().mockResolvedValue(null) },
    serviceOffering: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    serviceBooking: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    serviceProvider: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    serviceProviderSociety: { upsert: vi.fn() },
    serviceCategory: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    serviceRating: { create: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  (prisma as { $transaction?: unknown }).$transaction = vi.fn().mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
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
  const bookingAccess = {
    createApproved: vi.fn().mockResolvedValue({ request: { id: 'access-1' }, credential: 'raw-pass' }),
  };
  return {
    prisma: prisma as {
      unitOccupancy: { findFirst: ReturnType<typeof vi.fn> };
      unitOwnership: { findFirst: ReturnType<typeof vi.fn> };
      serviceOffering: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
      serviceBooking: {
        create: ReturnType<typeof vi.fn>;
        findMany: ReturnType<typeof vi.fn>;
        findFirst: ReturnType<typeof vi.fn>;
        findFirstOrThrow: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        updateMany: ReturnType<typeof vi.fn>;
      };
      serviceProvider: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
      serviceProviderSociety: { upsert: ReturnType<typeof vi.fn> };
      serviceCategory: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
      serviceRating: { create: ReturnType<typeof vi.fn> };
      $queryRaw: ReturnType<typeof vi.fn>;
      $transaction: ReturnType<typeof vi.fn>;
    },
    entitlements,
    access,
    operations,
    bookingAccess,
    service: new ServicesMarketplaceService(
      prisma as unknown as ConstructorParameters<typeof ServicesMarketplaceService>[0],
      entitlements as unknown as ConstructorParameters<typeof ServicesMarketplaceService>[1],
      access as unknown as ConstructorParameters<typeof ServicesMarketplaceService>[2],
      operations as unknown as ConstructorParameters<typeof ServicesMarketplaceService>[3],
      bookingAccess as unknown as ConstructorParameters<typeof ServicesMarketplaceService>[4],
    ),
  };
}

describe('ServicesMarketplaceService', () => {
  it('snapshots price and commission while serializing provider availability validation', async () => {
    const { prisma, service } = setup();
    prisma.serviceOffering.findFirst.mockResolvedValue({
      id: 'offering-1',
      providerId: 'provider-1',
      pricePaise: 200000,
      provider: { societies: [{ commissionBps: 1250 }] },
    });
    prisma.serviceBooking.findFirst.mockResolvedValue(null);
    prisma.serviceBooking.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(data));

    const scheduledFrom = new Date('2026-09-02T10:00:00Z');
    const scheduledUntil = new Date('2026-09-02T12:00:00Z');
    const result = await service.book('society-1', 'user-1', 'unit-1', 'offering-1', scheduledFrom, scheduledUntil);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.serviceBooking.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        societyId: 'society-1',
        providerId: 'provider-1',
        scheduledFrom: { lt: scheduledUntil },
        scheduledUntil: { gt: scheduledFrom },
      }),
    }));
    expect(result.servicePricePaise).toBe(200000);
    expect(result.commissionBps).toBe(1250);
    expect(result.commissionPaise).toBe(25000);
  });

  it('rejects an overlapping booking after acquiring the transaction lock', async () => {
    const { prisma, service } = setup();
    prisma.serviceOffering.findFirst.mockResolvedValue({
      id: 'offering-1',
      providerId: 'provider-1',
      pricePaise: 50000,
      provider: { societies: [{ commissionBps: 1000 }] },
    });
    prisma.serviceBooking.findFirst.mockResolvedValue({ id: 'existing-booking' });

    await expect(service.book(
      'society-1',
      'user-1',
      'unit-1',
      'offering-1',
      new Date('2026-09-10T10:00:00Z'),
      new Date('2026-09-10T11:00:00Z'),
    )).rejects.toThrow('Provider is not available');

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.serviceBooking.create).not.toHaveBeenCalled();
  });

  it('allows a verified current owner to book without current occupancy', async () => {
    const { prisma, service } = setup();
    prisma.unitOccupancy.findFirst.mockResolvedValue(null);
    prisma.unitOwnership.findFirst.mockResolvedValue({ id: 'ownership-1' });
    prisma.serviceOffering.findFirst.mockResolvedValue({
      id: 'offering-1',
      providerId: 'provider-1',
      pricePaise: 50000,
      provider: { societies: [{ commissionBps: 1000 }] },
    });
    prisma.serviceBooking.findFirst.mockResolvedValue(null);
    prisma.serviceBooking.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(data));

    await expect(service.book(
      'society-1',
      'owner-1',
      'unit-1',
      'offering-1',
      new Date('2026-09-10T10:00:00Z'),
      new Date('2026-09-10T11:00:00Z'),
    )).resolves.toMatchObject({ residentUserId: 'owner-1', unitId: 'unit-1' });

    expect(prisma.unitOwnership.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ societyId: 'society-1', userId: 'owner-1', unitId: 'unit-1', active: true, verified: true }),
    }));
  });

  it('rejects a user with neither current occupancy nor verified ownership', async () => {
    const { prisma, service } = setup();
    prisma.unitOccupancy.findFirst.mockResolvedValue(null);
    prisma.unitOwnership.findFirst.mockResolvedValue(null);

    await expect(service.book(
      'society-1',
      'user-1',
      'unit-1',
      'offering-1',
      new Date('2026-09-10T10:00:00Z'),
      new Date('2026-09-10T11:00:00Z'),
    )).rejects.toThrow('Unit does not belong to authenticated resident');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('confirms a booking and creates its approved access credential atomically', async () => {
    const { prisma, access, bookingAccess, service } = setup();
    prisma.serviceBooking.findFirst.mockResolvedValue({
      id: 'booking-1', societyId: 'society-1', unitId: 'unit-1', residentUserId: 'owner-1',
      providerId: 'provider-1', offeringId: 'offering-1', status: 'REQUESTED', accessRequestId: null,
      scheduledFrom: new Date('2026-09-10T10:00:00Z'), scheduledUntil: new Date('2026-09-10T12:00:00Z'),
      provider: { businessName: 'Aaraa Plumbing', phone: '9999999999' }, offering: { name: 'Pipe repair' },
    });
    prisma.serviceBooking.updateMany.mockResolvedValue({ count: 1 });
    prisma.serviceBooking.findFirstOrThrow.mockResolvedValue({ id: 'booking-1', status: 'CONFIRMED', accessRequestId: 'access-1' });

    const result = await service.confirm('society-1', 'booking-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(bookingAccess.createApproved).toHaveBeenCalledWith(prisma, expect.objectContaining({
      societyId: 'society-1',
      userId: 'owner-1',
      unitId: 'unit-1',
      bookingId: 'booking-1',
      providerId: 'provider-1',
      offeringId: 'offering-1',
    }));
    expect(prisma.serviceBooking.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'booking-1', societyId: 'society-1', status: 'REQUESTED', accessRequestId: null }),
      data: { status: 'CONFIRMED', accessRequestId: 'access-1' },
    }));
    expect(access.create).not.toHaveBeenCalled();
    expect(access.approve).not.toHaveBeenCalled();
    expect(result.accessCredential).toBe('raw-pass');
  });

  it('does not issue another credential for an already-confirmed booking', async () => {
    const { prisma, bookingAccess, service } = setup();
    prisma.serviceBooking.findFirst.mockResolvedValue({ id: 'booking-1', societyId: 'society-1', status: 'CONFIRMED' });

    await expect(service.confirm('society-1', 'booking-1')).rejects.toThrow('Booking is confirmed');

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(bookingAccess.createApproved).not.toHaveBeenCalled();
    expect(prisma.serviceBooking.updateMany).not.toHaveBeenCalled();
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
