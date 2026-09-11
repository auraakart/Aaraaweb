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

    const statement = queryRaw.mock.calls[0]?.[0] as { strings?: string[] } | undefined;
    const sql = statement?.strings?.join(' ') ?? '';
    expect(sql).toContain('ConsumerServiceBooking');
    expect(sql).toContain('ServiceProvider');
    expect(sql).toContain('ConsumerProviderCommercialProfile');
    expect(sql).toContain("INTERVAL '30 days'");
    expect(sql).toContain("INTERVAL '90 days'");
    expect(sql).toContain("'COMPLETED'");
    expect(sql).toContain("'CANCELLED'");
    expect(sql).toContain("'VERIFIED'");
  });

  it('returns only ageing active bookings that need operational attention', async () => {
    const row = {
      bookingId: '11111111-1111-4111-8111-111111111111',
      status: 'REQUESTED',
      scheduledStart: new Date('2026-09-12T05:00:00.000Z'),
      scheduledEnd: new Date('2026-09-12T06:00:00.000Z'),
      createdAt: new Date('2026-09-11T20:00:00.000Z'),
      updatedAt: new Date('2026-09-11T20:00:00.000Z'),
      offeringName: 'AC service',
      providerName: 'Trusted Home Care',
      reason: 'REQUEST_AWAITING_CONFIRMATION',
      attentionAgeMinutes: 180,
    };
    const queryRaw = vi.fn().mockResolvedValue([row]);
    const service = new ServicesMarketplaceOperationsSummaryService({ $queryRaw: queryRaw } as never);

    await expect(service.getAttentionQueue()).resolves.toEqual({
      thresholds: {
        requestConfirmationMinutes: 120,
        confirmedStartGraceMinutes: 30,
        inProgressOverrunMinutes: 60,
      },
      items: [row],
    });

    const statement = queryRaw.mock.calls[0]?.[0] as { strings?: string[] } | undefined;
    const sql = statement?.strings?.join(' ') ?? '';
    expect(sql).toContain("'REQUESTED'");
    expect(sql).toContain("'CONFIRMED'");
    expect(sql).toContain("'IN_PROGRESS'");
    expect(sql).toContain("INTERVAL '2 hours'");
    expect(sql).toContain("INTERVAL '30 minutes'");
    expect(sql).toContain("INTERVAL '60 minutes'");
    expect(sql).toContain('LIMIT 50');
    expect(sql).not.toContain("'COMPLETED'");
    expect(sql).not.toContain("'CANCELLED'");
  });
});
