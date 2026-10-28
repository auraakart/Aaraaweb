import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AccountingExportService, ACCOUNTING_EXPORT_CONTRACT_V1 } from './accounting-export.service';
import { AccountingConnectorDeliveryService } from './accounting-connector-delivery.service';

const society = '11111111-1111-4111-8111-111111111111';
const input = { idempotencyKey: 'stable-key', contractVersion: ACCOUNTING_EXPORT_CONTRACT_V1,
  format: 'JSONL' as const, fromDate: '2026-10-01', toDate: '2026-10-31' };
const job = { id: '22222222-2222-4222-8222-222222222222', societyId: society, requestHash: 'hash',
  contractVersion: input.contractVersion, format: input.format, fromDate: new Date(input.fromDate), toDate: new Date(input.toDate),
  status: 'PROCESSING', recordCount: null, artifactKey: null, errorCode: null, createdAt: new Date(), completedAt: null };
function fixture() {
  const tx = { $queryRaw: vi.fn<(sql: Prisma.Sql) => Promise<unknown[]>>().mockResolvedValue([]),
    $executeRaw: vi.fn<(sql: Prisma.Sql) => Promise<number>>().mockResolvedValue(1), auditEvent: { create: vi.fn() } };
  const root = vi.fn(async () => { throw new Error('Unscoped database access'); });
  const prisma = { $queryRaw: root, $executeRaw: root, $transaction: root,
    withTenantContext: vi.fn(async (scope: string, run: (client: typeof tx) => Promise<unknown>) => {
      if (scope !== society) throw new Error('Missing tenant context');
      return run(tx);
    }) };
  return { tx, prisma, exports: new AccountingExportService(prisma as never),
    connector: new AccountingConnectorDeliveryService(prisma as never, {} as never) };
}
function scopes(prisma: ReturnType<typeof fixture>['prisma']) {
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(prisma.withTenantContext.mock.calls.every(([scope]) => scope === society)).toBe(true);
}

describe('Accounting service context regression', () => {
  it('scopes export listing, detail and artifact reads and retains missing responses', async () => {
    const { exports, tx, prisma } = fixture();
    expect(await exports.list(society)).toEqual([]);
    await expect(exports.get(society, job.id)).rejects.toThrow(/not found/);
    await expect(exports.artifact(society, job.id)).rejects.toThrow(/not found/);
    tx.$queryRaw.mockResolvedValueOnce([job]).mockResolvedValueOnce([{ content: 'immutable' }]);
    expect(await exports.get(society, job.id)).toBe(job);
    expect(await exports.artifact(society, job.id)).toEqual({ content: 'immutable' });
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(5);
    scopes(prisma);
  });

  it('reuses an existing artifact and completes in the same scoped write transaction', async () => {
    const { exports, tx, prisma } = fixture();
    tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'existing-artifact' }]);
    await exports.executeClaimed(job);
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw.mock.calls[0][0].values).toContain('existing-artifact');
    expect(tx.$executeRaw.mock.calls[0][0].sql).toContain('"status"=\'PROCESSING\'');
    scopes(prisma);
  });

  it('scopes generation failure evidence and keeps raw exception details out', async () => {
    const { exports, tx, prisma } = fixture();
    tx.$queryRaw.mockRejectedValueOnce(new Error('Bearer private-token resident-data'));
    await exports.executeClaimed(job);
    expect(tx.$executeRaw.mock.calls[0][0].values).toContain('EXPORT_GENERATION_FAILED');
    expect(JSON.stringify(tx.$executeRaw.mock.calls)).not.toContain('private-token');
    scopes(prisma);
  });

  it('fails safely when an artifact cannot be persisted', async () => {
    const { exports, tx, prisma } = fixture();
    await exports.executeClaimed(job);
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(3);
    expect(tx.$executeRaw.mock.calls[0][0].values).toContain('EXPORT_ARTIFACT_PERSIST_FAILED');
    scopes(prisma);
  });

  it('rejects invalid ranges before database work', async () => {
    const { exports, prisma } = fixture();
    await expect(exports.create(society, 'user', { ...input, toDate: '2026-09-01' })).rejects.toThrow(/start/);
    await expect(exports.create(society, 'user', { ...input, toDate: '2028-01-01' })).rejects.toThrow(/366/);
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
  });

  it('scopes connector list, audit list and both aggregate queries', async () => {
    const { connector, prisma } = fixture();
    expect(await connector.list(society)).toEqual([]);
    expect(await connector.actions(society)).toEqual([]);
    expect(await connector.metrics(society)).toMatchObject({ totals: { totalCount: 0 }, providers: [] });
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(4);
    scopes(prisma);
  });

  it('fails closed without a tenant context rather than falling back to root I/O', async () => {
    const { exports, connector, prisma } = fixture();
    await expect(exports.list('')).rejects.toThrow(/context/);
    await expect(connector.retry('', 'user', job.id)).rejects.toThrow(/context/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
