import { describe, expect, it, vi } from 'vitest';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { PaymentReconciliationObservabilityService } from './payment-reconciliation-observability.service';

const society = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
const payment = '33333333-3333-4333-8333-333333333333';
const id = '44444444-4444-4444-8444-444444444444';

function fixture() {
  const tx = { $queryRaw: vi.fn().mockResolvedValue([]), $executeRaw: vi.fn().mockResolvedValue(1) };
  const prisma = {
    $queryRaw: vi.fn(async () => { throw new Error('Unscoped root read'); }),
    $executeRaw: vi.fn(async () => { throw new Error('Unscoped root write'); }),
    $transaction: vi.fn(async () => { throw new Error('Unscoped root transaction'); }),
    withTenantContext: vi.fn((_scope: string, run: (client: typeof tx) => unknown) => run(tx)),
  };
  return { tx, prisma, service: new PaymentReconciliationService(prisma as never) };
}

describe('Reconciliation selected transaction boundaries', () => {
  it.each([
    ['case queue', (s: PaymentReconciliationService) => s.listCases(society)],
    ['case detail', (s: PaymentReconciliationService) => s.getCase(society, id)],
    ['operation history', (s: PaymentReconciliationService) => s.listOperations(society, payment)],
    ['case resolution', (s: PaymentReconciliationService) => s.resolveCase(society, user, id, 'Evidence verified')],
  ] as const)('runs %s only in its selected society', async (_name, run) => {
    const { tx, prisma, service } = fixture();
    tx.$queryRaw.mockResolvedValue([{ id }]);
    await run(service);
    expect(prisma.withTenantContext).toHaveBeenCalledExactlyOnceWith(society, expect.any(Function));
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a missing or foreign case without a root-client fallback', async () => {
    const { service, prisma } = fixture();
    await expect(service.getCase(society, id)).rejects.toThrow('Reconciliation case not found');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('does not read a resolution response if the scoped update did not succeed', async () => {
    const { tx, service } = fixture();
    tx.$executeRaw.mockResolvedValue(0);
    await expect(service.resolveCase(society, user, id, 'Evidence verified')).rejects.toThrow('missing or already resolved');
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('keeps payment locking, refund totals and case creation in one context', async () => {
    const { tx, prisma, service } = fixture();
    tx.$queryRaw.mockResolvedValueOnce([{ id: payment, status: 'CAPTURED', amountPaise: 1000n }])
      .mockResolvedValueOnce([{ total: 200n }]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id }]).mockResolvedValueOnce([{ id, expectedCapturedPaise: '1000', expectedRefundedPaise: '200' }]);
    await expect(service.openOrRefreshCase(society, payment, ' configured-http ')).resolves.toMatchObject({ id });
    expect(prisma.withTenantContext).toHaveBeenCalledExactlyOnceWith(society, expect.any(Function));
    expect(tx.$queryRaw.mock.calls[0][0].strings.join(' ')).toContain('FOR UPDATE');
    expect(tx.$queryRaw.mock.calls[3][0].values).toEqual([society, payment, 'configured-http', 1000n, 200n]);
  });

  it('rejects a foreign payment before creating a reconciliation case', async () => {
    const { tx, service } = fixture();
    await expect(service.openOrRefreshCase(society, payment, 'configured-http')).rejects.toThrow('Payment not found');
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it.each([
    [1000, 'CAPTURED', 'MATCHED'], [999, 'CAPTURED', 'MISMATCH'], [0, 'DISPUTED', 'ACTION_REQUIRED'],
  ] as const)('records %s paise / %s as %s under the locked case context', async (amount, status, expected) => {
    const { tx, prisma, service } = fixture();
    tx.$queryRaw.mockResolvedValueOnce([{ status: 'PENDING', expectedCapturedPaise: 1000n, expectedRefundedPaise: 0n }])
      .mockResolvedValueOnce([{ id, status: expected }]);
    await expect(service.recordObservation(society, id, { observedAmountPaise: amount, observedProviderStatus: status }))
      .resolves.toMatchObject({ status: expected });
    expect(prisma.withTenantContext).toHaveBeenCalledExactlyOnceWith(society, expect.any(Function));
    expect(tx.$executeRaw.mock.calls[0][0].values).toContain(expected);
  });

  it('does not mutate a resolved case', async () => {
    const { tx, service } = fixture();
    tx.$queryRaw.mockResolvedValueOnce([{ status: 'RESOLVED' }]);
    await expect(service.recordObservation(society, id, { observedAmountPaise: 0, observedProviderStatus: 'FAILED' }))
      .rejects.toThrow('Resolved reconciliation case cannot be changed');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('creates a new operation and reads its response in one scoped transaction', async () => {
    const { tx, prisma, service } = fixture();
    tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id }]).mockResolvedValueOnce([{ id, status: 'REQUESTED' }]);
    await expect(service.createOperation(society, user, payment, { operationType: 'REFUND', provider: 'configured-http',
      amountPaise: 500, idempotencyKey: 'refund-1' })).resolves.toMatchObject({ id, status: 'REQUESTED' });
    expect(prisma.withTenantContext).toHaveBeenCalledExactlyOnceWith(society, expect.any(Function));
    expect(tx.$executeRaw.mock.calls[0][0].values).toContain(`${society}:refund-1`);
    expect(tx.$queryRaw.mock.calls[1][0].values).toContain(society);
  });

  it('denies operation results for a missing or foreign operation', async () => {
    const { tx, service } = fixture();
    await expect(service.recordOperationResult(society, id, { status: 'SETTLED' })).rejects.toThrow('Gateway operation not found');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('reads both metrics aggregates in the same scoped transaction and preserves bigint strings', async () => {
    const { tx, prisma } = fixture();
    tx.$queryRaw.mockResolvedValueOnce([{ pending: 9007199254740993n, matched: 1n, mismatch: 2n, actionRequired: 3n, resolved: 4n }])
      .mockResolvedValueOnce([{ requested: 5n, unknown: 6n, failed: 7n, settled: 8n, retryExhausted: 9n }]);
    await expect(new PaymentReconciliationObservabilityService(prisma as never).metrics(society)).resolves.toEqual({
      cases: { pending: '9007199254740993', matched: '1', mismatch: '2', actionRequired: '3', resolved: '4' },
      operations: { requested: '5', unknown: '6', failed: '7', settled: '8', retryExhausted: '9' },
    });
    expect(prisma.withTenantContext).toHaveBeenCalledExactlyOnceWith(society, expect.any(Function));
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('does no reconciliation I/O if context setup fails', async () => {
    const { tx, prisma, service } = fixture();
    prisma.withTenantContext.mockRejectedValueOnce(new Error('context unavailable'));
    await expect(service.listCases(society)).rejects.toThrow('context unavailable');
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
