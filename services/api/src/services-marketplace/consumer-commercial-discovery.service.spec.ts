import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerCommercialDiscoveryService } from './consumer-commercial-discovery.service';
import { ConsumerServiceLocationService } from './consumer-service-location.service';

type SqlLike = { strings?: readonly string[] };

describe('ConsumerCommercialDiscoveryService', () => {
  it('authorizes the requested location before querying commercial placements', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const locations = {
      resolveLocation: vi.fn().mockResolvedValue({
        type: 'HOME',
        id: '22222222-2222-2222-2222-222222222222',
        postalCode: '600115',
      }),
    };
    const service = new ConsumerCommercialDiscoveryService(
      prisma as unknown as PrismaService,
      locations as unknown as ConsumerServiceLocationService,
    );

    await service.list(
      '11111111-1111-1111-1111-111111111111',
      'HOME',
      '22222222-2222-2222-2222-222222222222',
    );

    expect(locations.resolveLocation).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      'HOME',
      '22222222-2222-2222-2222-222222222222',
    );
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(locations.resolveLocation.mock.invocationCallOrder[0]).toBeLessThan(prisma.$queryRaw.mock.invocationCallOrder[0]);
  });

  it('keeps verification and serviceability filters in the paid-placement query', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const locations = {
      resolveLocation: vi.fn().mockResolvedValue({ postalCode: '600115' }),
    };
    const service = new ConsumerCommercialDiscoveryService(
      prisma as unknown as PrismaService,
      locations as unknown as ConsumerServiceLocationService,
    );

    await service.list(
      '11111111-1111-1111-1111-111111111111',
      'HOME',
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333',
    );

    const sql = prisma.$queryRaw.mock.calls[0][0] as SqlLike;
    const text = sql.strings ? sql.strings.join(' ') : String(sql);
    expect(text).toContain('VERIFIED');
    expect(text).toContain('ConsumerProviderServiceArea');
    expect(text).toContain('ConsumerOfferingServiceArea');
    expect(text).toContain('commercialPlacement');
    expect(text).toContain('SPONSORED');
    expect(text).toContain('FEATURED');
  });
});
