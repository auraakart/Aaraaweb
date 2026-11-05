import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ReportsAnalyticsService } from './reports-analytics.service';

const from = '2026-09-01T00:00:00.000Z';
const to = '2026-09-30T00:00:00.000Z';
const societies = [
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
];

function analyticsPrisma() {
  const txSql = vi.fn(async (query: { values: unknown[]; strings: readonly string[] }): Promise<Record<string, unknown>[]> => {
    void query;
    return [{}];
  });
  const rootSql = vi.fn((query?: unknown) => {
    void query;
    throw new Error('Society-scoped analytics must not query root Prisma');
  });
  const withTenantContext = vi.fn(async (_societyId: string, action: (tx: { $queryRaw: typeof txSql }) => Promise<unknown>) => {
    return action({ $queryRaw: txSql });
  });
  return { txSql, rootSql, withTenantContext, prisma: { $queryRaw: rootSql, withTenantContext } };
}

describe('V5.14.12 analytics tenant transaction boundaries', () => {
  it('runs experience funnel SQL within a single selected society transaction without root fallback', async () => {
    const { txSql, rootSql, withTenantContext, prisma } = analyticsPrisma();
    const service = new ReportsAnalyticsService(prisma as never);
    const result = await service.experienceFunnel(societies[0], from, to);
    expect(result.privacy.rawInteractionTraceStored).toBe(false);
    expect(withTenantContext).toHaveBeenCalledTimes(1);
    expect(withTenantContext).toHaveBeenCalledWith(societies[0], expect.any(Function));
    expect(txSql).toHaveBeenCalledTimes(4);
    for (const [sql] of txSql.mock.calls) {
      expect(sql.values).toContain(societies[0]);
      expect(sql.strings.join(' ')).toContain('"societyId"');
    }
    expect(rootSql).not.toHaveBeenCalled();
  });

  it('runs operations dashboard SQL in a selected tenant transaction, preserving all alias keys', async () => {
    const { txSql, rootSql, withTenantContext, prisma } = analyticsPrisma();
    const service = new ReportsAnalyticsService(prisma as never);
    const result = await service.operationsDashboard(societies[1], from, to);
    expect(result.source).toBe('authoritative-domain-records');
    expect(withTenantContext).toHaveBeenCalledTimes(1);
    expect(withTenantContext).toHaveBeenCalledWith(societies[1], expect.any(Function));
    expect(txSql).toHaveBeenCalledTimes(3);
    for (const [sql] of txSql.mock.calls) {
      expect(sql.values).toContain(societies[1]);
      expect(sql.strings.join(' ')).toContain('"societyId"');
    }
    expect(rootSql).not.toHaveBeenCalled();
  });

  it('keeps consecutive different-society experience and operations requests explicitly bound', async () => {
    const { txSql, withTenantContext, prisma } = analyticsPrisma();
    const service = new ReportsAnalyticsService(prisma as never);
    for (const id of societies) {
      await service.experienceFunnel(id, from, to);
      await service.operationsDashboard(id, from, to);
    }
    expect(withTenantContext.mock.calls.map(([id]) => id)).toEqual([
      societies[0], societies[0], societies[1], societies[1],
    ]);
    expect(txSql).toHaveBeenCalledTimes(14);
    const societyBindings = txSql.mock.calls.map(([sql]) => {
      const matches = societies.filter((id) => sql.values.includes(id));
      expect(matches).toHaveLength(1);
      return matches[0];
    });
    expect(societyBindings).toEqual([
      ...Array(7).fill(societies[0]), ...Array(7).fill(societies[1]),
    ]);
  });

  it('retains intentionally cross-society platform analytics on the explicit platform client', async () => {
    const rootSql = vi.fn(async (query: unknown) => { void query; return []; });
    const withTenantContext = vi.fn((id: string, action: unknown) => {
      void id;
      void action;
      throw new Error('Platform metrics cannot be forced into one society');
    });
    const service = new ReportsAnalyticsService({ $queryRaw: rootSql, withTenantContext } as never);
    const portfolio = await service.platformPortfolioCommandCentre(from, to);
    const independent = await service.platformOutcomes(from, to);
    expect(portfolio.summary.societies).toBe(0);
    expect(independent.independentHome.homeBookings).toBe(0);
    expect(rootSql).toHaveBeenCalledTimes(4);
    expect(withTenantContext).not.toHaveBeenCalled();
  });

  it('rejects invalid date ranges before opening any transaction', async () => {
    const { withTenantContext, prisma } = analyticsPrisma();
    const service = new ReportsAnalyticsService(prisma as never);
    await expect(service.experienceFunnel(societies[0], 'bad-date', to)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.operationsDashboard(societies[0], from, '2029-01-01')).rejects.toBeInstanceOf(BadRequestException);
    expect(withTenantContext).not.toHaveBeenCalled();
  });
});
