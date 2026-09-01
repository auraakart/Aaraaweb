import { describe, expect, it, vi } from 'vitest';
import { ServicesMarketplaceService } from './services-marketplace.service';

function setup() {
  const prisma: any = {
    unitResident: { findFirst: vi.fn().mockResolvedValue({ id: 'link-1' }) },
    serviceOffering: { findFirst: vi.fn(), create: vi.fn() },
    serviceBooking: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    serviceProvider: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    serviceProviderSociety: { upsert: vi.fn() },
    serviceCategory: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    serviceRating: { create: vi.fn() },
  };
  const entitlements: any = { isEnabled: vi.fn().mockResolvedValue(true) };
  const access: any = {
    create: vi.fn().mockResolvedValue({ id: 'access-1' }),
    approve: vi.fn().mockResolvedValue({ request: { id: 'access-1' }, credential: 'raw-pass' }),
    cancel: vi.fn(),
  };
  return { prisma, entitlements, access, service: new ServicesMarketplaceService(prisma, entitlements, access) };
}

describe('ServicesMarketplaceService', () => {
  it('snapshots price and commission when a resident books', async () => {
    const { prisma, service } = setup();
    prisma.serviceOffering.findFirst.mockResolvedValue({
      id: 'offering-1',
      providerId: 'provider-1',
      pricePaise: 200000,
      provider: { societies: [{ commissionBps: 1250 }] },
    });
    prisma.serviceBooking.create.mockImplementation(({ data }: any) => Promise.resolve(data));

    const result: any = await service.book(
      'society-1',
      'user-1',
      'unit-1',
      'offering-1',
      new Date('2026-09-02T10:00:00Z'),
      new Date('2026-09-02T12:00:00Z'),
    );

    expect(result.servicePricePaise).toBe(200000);
    expect(result.commissionBps).toBe(1250);
    expect(result.commissionPaise).toBe(25000);
  });

  it('creates and approves a service-provider access request when booking is confirmed', async () => {
    const { prisma, access, service } = setup();
    prisma.serviceBooking.findFirst.mockResolvedValue({
      id: 'booking-1',
      societyId: 'society-1',
      unitId: 'unit-1',
      residentUserId: 'user-1',
      providerId: 'provider-1',
      offeringId: 'offering-1',
      status: 'REQUESTED',
      scheduledFrom: new Date('2026-09-02T10:00:00Z'),
      scheduledUntil: new Date('2026-09-02T12:00:00Z'),
      provider: { businessName: 'Aaraa Plumbing', phone: '9999999999' },
      offering: { name: 'Pipe repair' },
    });
    prisma.serviceBooking.update.mockResolvedValue({ id: 'booking-1', status: 'CONFIRMED', accessRequestId: 'access-1' });

    const result = await service.confirm('society-1', 'booking-1');

    expect(access.create).toHaveBeenCalledWith(
      'society-1',
      'user-1',
      'unit-1',
      'SERVICE_PROVIDER',
      'Aaraa Plumbing',
      '9999999999',
      'Pipe repair',
      expect.objectContaining({ bookingId: 'booking-1' }),
    );
    expect(access.approve).toHaveBeenCalled();
    expect(result.accessCredential).toBe('raw-pass');
  });

  it('rejects marketplace use when the society feature is disabled', async () => {
    const { entitlements, service } = setup();
    entitlements.isEnabled.mockResolvedValue(false);
    await expect(service.listOfferings('society-1')).rejects.toThrow('not enabled');
  });
});
