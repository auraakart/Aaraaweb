import { describe, expect, it, vi } from 'vitest';
import { OccupancyLifecycleService } from './occupancy-lifecycle.service';

const society = '11111111-1111-4111-8111-111111111111';
function fixture() {
  const row = { id: 'request', unitId: 'unit', userId: 'resident', kind: 'MOVE_IN' };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([row]),
    unit: { findMany: vi.fn().mockResolvedValue([]) },
    unitOccupancy: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    unitOwnership: { findMany: vi.fn().mockResolvedValue([]) },
    household: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  const withTenantContext = vi.fn(async (scope: string, run: (client: typeof tx) => Promise<unknown>) => {
    expect(scope).toBe(society);
    return run(tx);
  });
  const prisma = new Proxy({ withTenantContext }, { get(target, key) {
    if (key === 'withTenantContext') return target.withTenantContext;
    throw new Error(`Root database access: ${String(key)}`);
  } });
  return { tx, withTenantContext, service: new OccupancyLifecycleService(prisma as never) };
}

describe('Occupancy lifecycle read transaction boundaries', () => {
  it.each(['list', 'listMine', 'operatorContext', 'selfContext', 'get', 'getMine', 'readiness'] as const)(
    'uses only one selected tenant client for %s', async method => {
      const f = fixture();
      if (method === 'list' || method === 'operatorContext') await f.service[method](society);
      else if (method === 'listMine' || method === 'selfContext') await f.service[method](society, 'resident');
      else if (method === 'getMine') await f.service.getMine(society, 'resident', 'request');
      else await f.service[method](society, 'request');
      expect(f.withTenantContext).toHaveBeenCalledOnce();
    },
  );
  it('checks resident authority before fetching detail and keeps the same client', async () => {
    const f = fixture();
    await f.service.getMine(society, 'resident', 'request');
    const query = f.tx.$queryRaw.mock.calls[0][0] as unknown as { text: string; values: unknown[] };
    expect(query.text).toContain('"requestedByUserId"');
    expect(query.values).toContain('resident');
    expect(query.text).toContain('JOIN "Building"');
    expect(f.tx.$queryRaw).toHaveBeenCalledTimes(5);
    f.tx.$queryRaw.mockClear().mockResolvedValue([]);
    await expect(f.service.getMine(society, 'foreign', 'request')).rejects.toThrow('not found');
    expect(f.tx.$queryRaw).toHaveBeenCalledOnce();
  });
  it.each(['get', 'readiness'] as const)('does not fetch children after a denied %s lookup', async method => {
    const f = fixture(); f.tx.$queryRaw.mockResolvedValue([]);
    await expect(f.service[method](society, 'foreign')).rejects.toThrow('not found');
    expect(f.tx.$queryRaw).toHaveBeenCalledOnce();
    expect(f.tx.household.findFirst).not.toHaveBeenCalled();
  });
  it('preserves effective owner/occupant windows and adds both parent boundaries', async () => {
    const f = fixture(); await f.service.selfContext(society, 'resident');
    for (const mock of [f.tx.unitOccupancy.findMany, f.tx.unitOwnership.findMany]) {
      expect(mock).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
        societyId: society, userId: 'resident', active: true,
        effectiveFrom: { lte: expect.any(Date) }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: expect.any(Date) } }],
        unit: { societyId: society, building: { societyId: society } },
      }) }));
    }
    expect(f.tx.unitOwnership.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ verified: true }) }));
  });
  it('propagates tenant transaction failure without falling back to a root client', async () => {
    const f = fixture(); f.withTenantContext.mockRejectedValueOnce(new Error('Tenant unavailable'));
    await expect(f.service.list(society)).rejects.toThrow('Tenant unavailable');
    expect(f.tx.$queryRaw).not.toHaveBeenCalled();
  });
});
