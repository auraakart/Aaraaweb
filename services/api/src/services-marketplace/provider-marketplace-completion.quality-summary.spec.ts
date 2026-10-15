import { describe, expect, it, vi } from 'vitest';
import { ProviderMarketplaceCompletionService } from './provider-marketplace-completion.service';

const operatorUser = '11111111-1111-4111-8111-111111111111';
const providerId = '22222222-2222-4222-8222-222222222222';

function setup() {
  const prisma = { $queryRaw: vi.fn() };
  const operators = { resolveProvider: vi.fn().mockResolvedValue({ providerId }) };
  const availability = {};
  const service = new ProviderMarketplaceCompletionService(
    prisma as unknown as ConstructorParameters<typeof ProviderMarketplaceCompletionService>[0],
    operators as unknown as ConstructorParameters<typeof ProviderMarketplaceCompletionService>[1],
    availability as unknown as ConstructorParameters<typeof ProviderMarketplaceCompletionService>[2],
  );
  return { prisma, operators, service };
}

describe('Services 4.0.6 — provider quality evidence summary', () => {
  it('denies the query when provider authorization fails', async () => {
    const { prisma, operators, service } = setup();
    operators.resolveProvider.mockRejectedValue(new Error('Provider operator access is not available'));
    await expect(service.getProviderQualitySummary(operatorUser)).rejects.toThrow('Provider operator access');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('filters every operational metric by authenticated provider', async () => {
    const { prisma, operators, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([{
      completedBookings:12,
      completedWithChecklist:10,
      reworkRequests:3,
      openReworkRequests:1,
    }]);
    const summary = await service.getProviderQualitySummary(operatorUser);
    expect(operators.resolveProvider).toHaveBeenCalledWith(operatorUser);
    expect(summary).toEqual({
      periodDays:90, completedBookings:12, completedWithChecklist:10,
      reworkRequests:3, openReworkRequests:1,
      sufficientCompletedSample:true,
      reviewOnly:true, qualityScore:null,
      publicRankingEnabled:false, automaticPenaltyEnabled:false,
    });
    const query = prisma.$queryRaw.mock.calls[0][0] as {strings:readonly string[];values:unknown[]};
    const sql = query.strings.join('?');
    expect(sql).toContain('ConsumerServiceBooking');
    expect(sql).toContain('ConsumerServiceQualityChecklistSnapshot');
    expect(sql).toContain('ConsumerServiceDispute');
    expect(sql).toContain('INTERVAL \'90 days\'');
    expect(query.values).toEqual([providerId,providerId,providerId,providerId]);
    expect(sql).not.toContain('"userId"');
  });

  it('returns no fabricated score or ranking when the sample is too small', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([{
      completedBookings:3, completedWithChecklist:2, reworkRequests:0, openReworkRequests:0,
    }]);
    const summary = await service.getProviderQualitySummary(operatorUser);
    expect(summary.sufficientCompletedSample).toBe(false);
    expect(summary.qualityScore).toBe(null);
    expect(summary.reviewOnly).toBe(true);
    expect(summary.automaticPenaltyEnabled).toBe(false);
  });

  it('returns a safe empty read-only summary for a provider with no bookings', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    const summary = await service.getProviderQualitySummary(operatorUser);
    expect(summary.completedBookings).toBe(0);
    expect(summary.reworkRequests).toBe(0);
    expect(summary.qualityScore).toBe(null);
  });
});
