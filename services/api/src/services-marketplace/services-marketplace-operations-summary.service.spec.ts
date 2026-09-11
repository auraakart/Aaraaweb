import { describe, expect, it, vi } from 'vitest';
import { ServicesMarketplaceOperationsSummaryService } from './services-marketplace-operations-summary.service';

describe('ServicesMarketplaceOperationsSummaryService', () => {
  it('derives read-only pilot KPIs from marketplace system-of-record tables', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        bookings30d: 10n,
        completed30d: 7n,
        cancelled30d: 2n,
        activeVerifiedProviders: 4n,
        activeCommercialPlacements: 1n,
        repeatCustomers90d: 3n,
      },
    ]);
    const service = new ServicesMarketplaceOperationsSummaryService({ $queryRaw: queryRaw } as never);

    await expect(service.getSummary()).resolves.toEqual({
      windowDays: 30,
      bookings30d: 10,
      completed30d: 7,
      cancelled30d: 2,
      completionRate30d: 0.7,
      cancellationRate30d: 0.2,
      activeVerifiedProviders: 4,
      activeCommercialPlacements: 1,
      repeatCustomers90d: 3,
    });

    const sql = String(queryRaw.mock.calls[0]?.[0]);
    expect(sql).toContain('ConsumerServiceBooking');
    expect(sql).toContain('ServiceProvider');
    expect(sql).toContain('ConsumerProviderCommercialProfile');
    expect(sql).toContain("INTERVAL '30 days'");
    expect(sql).toContain("INTERVAL '90 days'");
    expect(sql).toContain("'COMPLETED'");
    expect(sql).toContain("'CANCELLED'");
    expect(sql).toContain("'VERIFIED'");
  });
});
