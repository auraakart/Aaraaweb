import { describe, expect, it, vi } from 'vitest';
import { UtilityResidentService } from './utility-resident.service';

const societyId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
function fixture() {
  const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };
  const withTenantContext = vi.fn(async (scope: string, run: (client: typeof tx) => Promise<unknown>) => {
    expect(scope).toBe(societyId);
    return run(tx);
  });
  const root = new Proxy({ withTenantContext }, { get(target, key) {
    if (key === 'withTenantContext') return target.withTenantContext;
    throw new Error('Root database access forbidden: ' + String(key));
  } });
  return { service: new UtilityResidentService(root as never), tx, withTenantContext };
}

describe('resident utility selected tenant reads', () => {
  it.each(['charges', 'usage', 'insights'])('selects the tenant before %s queries', async mode => {
    const { service, tx, withTenantContext } = fixture();
    if (mode === 'charges') await service.listIssuedCharges(societyId, userId);
    else if (mode === 'usage') await service.listUsageHistory(societyId, userId, 'unit-a');
    else await service.residentInsights(societyId, userId, 'unit-a');
    expect(withTenantContext).toHaveBeenCalledOnce();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(mode === 'insights' ? 2 : 1);
    for (const [query] of tx.$queryRaw.mock.calls as unknown as [{ values: unknown[] }][]) {
      expect(query.values).toContain(societyId);
      expect(query.values).toContain(userId);
      if (mode !== 'charges') expect(query.values).toContain('unit-a');
    }
  });

  it('retains per-meter usage signals and active provider evidence in one selected client', async () => {
    const { service, tx } = fixture();
    tx.$queryRaw.mockResolvedValueOnce([
      { meterId: 'a', consumptionSincePrevious: '30', readingAt: 'latest' },
      { meterId: 'a', consumptionSincePrevious: '10' },
      { meterId: 'a', consumptionSincePrevious: '10' },
      { meterId: 'b', consumptionSincePrevious: '-2' },
    ]).mockResolvedValueOnce([{ meterId: 'a', providerLinked: true }]);
    const result = await service.residentInsights(societyId, userId);
    expect(result).toMatchObject({ attentionCount: 1, providerLinkedCount: 1,
      prepaid: { balanceEvidenceAvailable: false, rechargeExecutionAvailable: false } });
    expect(result.meters).toEqual(expect.arrayContaining([
      expect.objectContaining({ meterId: 'a', latestConsumption: 30, recentBaselineAverage: 10,
        changePercent: 200, attention: 'HIGHER_THAN_RECENT', providerLinked: true }),
      expect.objectContaining({ meterId: 'b', latestConsumption: null, attention: 'INSUFFICIENT_EVIDENCE' }),
    ]));
  });

  it('does not attempt provider reads after usage failure', async () => {
    const { service, tx } = fixture();
    tx.$queryRaw.mockRejectedValueOnce(new Error('usage denied'));
    await expect(service.residentInsights(societyId, userId)).rejects.toThrow('usage denied');
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
  });

  it('propagates a provider failure without partial insight results or fallback root access', async () => {
    const { service, tx, withTenantContext } = fixture();
    tx.$queryRaw.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('provider denied'));
    await expect(service.residentInsights(societyId, userId)).rejects.toThrow('provider denied');
    expect(withTenantContext).toHaveBeenCalledOnce();
  });
});
