import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ReportsAnalyticsService } from './reports-analytics.service';

const from = '2026-09-01T00:00:00.000Z';
const to = '2026-09-30T00:00:00.000Z';
const societyA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const societyB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function scopedPrisma() {
  const txSql = vi.fn(async (sql: { values: unknown[]; strings: readonly string[] }): Promise<Record<string, unknown>[]> => {
    void sql;
    return [{}];
  });
  const rootSql = vi.fn((sql: unknown) => {
    void sql;
    throw new Error('Forbidden root Prisma read in society-scoped analytics');
  });
  const withTenantContext = vi.fn(async (
    id: string,
    operation: (tx: { $queryRaw: typeof txSql }) => Promise<unknown>,
    options?: { timeout?: number },
  ) => {
    void id;
    void options;
    return operation({ $queryRaw: txSql });
  });
  return { txSql, rootSql, withTenantContext, prisma: { $queryRaw: rootSql, withTenantContext } };
}

function assertOnlySociety(sqlCalls: Array<[{
  values: unknown[];
  strings: readonly string[];
}]>, id: string) {
  for (const [sql] of sqlCalls) {
    expect(sql.values).toContain(id);
    expect(sql.strings.join(' ')).toContain('"societyId"');
    expect(sql.values).not.toContain(id === societyA ? societyB : societyA);
  }
}

describe('V5.14.13 journey and outcome tenant-context reads', () => {
  it('runs all four journey queries in one bounded society transaction without root fallback', async () => {
    const { prisma, txSql, rootSql, withTenantContext } = scopedPrisma();
    const service = new ReportsAnalyticsService(prisma as never);
    const result = await service.journeyFunnel(societyA, from, to);
    expect(result.source).toBe('authoritative-domain-records');
    expect(withTenantContext).toHaveBeenCalledOnce();
    expect(withTenantContext).toHaveBeenCalledWith(societyA, expect.any(Function), { timeout: 15_000 });
    expect(txSql).toHaveBeenCalledTimes(4);
    assertOnlySociety(txSql.mock.calls, societyA);
    expect(rootSql).not.toHaveBeenCalled();
  });

  it('never queries financial receivables without finance permission and preserves redaction', async () => {
    const { prisma, txSql, rootSql, withTenantContext } = scopedPrisma();
    const service = new ReportsAnalyticsService(prisma as never);
    const result = await service.outcomes(societyA, from, to, false);
    expect(result.finance).toBeNull();
    expect(withTenantContext).toHaveBeenCalledWith(societyA, expect.any(Function), { timeout: 30_000 });
    expect(txSql).toHaveBeenCalledTimes(9);
    assertOnlySociety(txSql.mock.calls, societyA);
    const statements = txSql.mock.calls.map(([sql]) => sql.strings.join(' ')).join(' ');
    expect(statements).not.toContain('FROM "Receivable"');
    expect(statements).not.toContain('FROM "PaymentReconciliationCase"');
    expect(rootSql).not.toHaveBeenCalled();
  });

  it('executes all twelve outcome reads when finance permission is granted', async () => {
    const { prisma, txSql, rootSql, withTenantContext } = scopedPrisma();
    const service = new ReportsAnalyticsService(prisma as never);
    const result = await service.outcomes(societyB, from, to, true);
    expect(result.finance).not.toBeNull();
    expect(withTenantContext).toHaveBeenCalledWith(societyB, expect.any(Function), { timeout: 30_000 });
    expect(txSql).toHaveBeenCalledTimes(12);
    assertOnlySociety(txSql.mock.calls, societyB);
    const statements = txSql.mock.calls.map(([sql]) => sql.strings.join(' ')).join(' ');
    expect(statements).toContain('FROM "Receivable"');
    expect(statements).toContain('FROM "PaymentReconciliationCase"');
    expect(statements).toContain('FROM "ReceivableAllocationReversal"');
    expect(rootSql).not.toHaveBeenCalled();
  });

  it('never reuses a prior tenant across sequential journey and financial outcome reads', async () => {
    const { prisma, txSql, withTenantContext, rootSql } = scopedPrisma();
    const service = new ReportsAnalyticsService(prisma as never);
    for (const id of [societyA, societyB]) {
      await service.journeyFunnel(id, from, to);
      await service.outcomes(id, from, to, true);
    }
    expect(withTenantContext.mock.calls.map(([id]) => id)).toEqual([
      societyA, societyA, societyB, societyB,
    ]);
    expect(txSql).toHaveBeenCalledTimes(32);
    const bound = txSql.mock.calls.map(([sql]) => {
      const ids = [societyA, societyB].filter(id => sql.values.includes(id));
      expect(ids).toHaveLength(1);
      return ids[0];
    });
    expect(bound).toEqual([
      ...Array(16).fill(societyA), ...Array(16).fill(societyB),
    ]);
    expect(rootSql).not.toHaveBeenCalled();
  });

  it('rejects invalid time ranges before transaction creation', async () => {
    const { prisma, withTenantContext } = scopedPrisma();
    const service = new ReportsAnalyticsService(prisma as never);
    await expect(service.journeyFunnel(societyA, 'bad-time', to)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.outcomes(societyA, from, '2029-01-01', true)).rejects.toBeInstanceOf(BadRequestException);
    expect(withTenantContext).not.toHaveBeenCalled();
  });

  it('preserves global platform analytics outside tenant context', async () => {
    const rootSql = vi.fn(async (sql: unknown) => { void sql; return []; });
    const withTenantContext = vi.fn((id: string, operation: unknown) => {
      void id;
      void operation;
      throw new Error('Global reports must not use a selected society');
    });
    const service = new ReportsAnalyticsService({ $queryRaw: rootSql, withTenantContext } as never);
    const portfolio = await service.platformPortfolioCommandCentre(from, to);
    const independent = await service.platformOutcomes(from, to);
    expect(portfolio.summary.societies).toBe(0);
    expect(independent.independentHome.homeBookings).toBe(0);
    expect(rootSql).toHaveBeenCalledTimes(4);
    expect(withTenantContext).not.toHaveBeenCalled();
  });
});
