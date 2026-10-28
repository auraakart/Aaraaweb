import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentReconciliationRunner } from './payment-reconciliation.runner';

const society = '11111111-1111-4111-8111-111111111111';
function operation(overrides = {}) {
  return { id: 'op-1', societyId: society, paymentId: 'payment-1', operationType: 'REFUND', provider: 'test-provider',
    providerOperationId: null, amountPaise: 500n, idempotencyKey: 'stored-key', attemptCount: 0, ...overrides };
}
function fixture(operations: ReturnType<typeof operation>[] = [], cases: unknown[] = []) {
  const query = vi.fn<(sql: unknown) => Promise<unknown[]>>()
    .mockResolvedValueOnce(operations.map(op => ({ ...op, attemptCount: op.attemptCount + 1 }))).mockResolvedValueOnce(cases);
  const prisma = { $queryRaw: query,
    $transaction: vi.fn(async () => { throw new Error('Unrestricted transaction'); }),
    $executeRaw: vi.fn(async () => { throw new Error('Unrestricted write'); }) };
  const adapter = { provider: 'test-provider', environment: 'sandbox', isConfigured: vi.fn().mockReturnValue(true),
    queryPayment: vi.fn().mockResolvedValue({ providerPaymentId: 'provider-pay', providerStatus: 'CAPTURED', amountPaise: 500 }),
    refund: vi.fn().mockResolvedValue({ status: 'ACCEPTED', providerOperationId: 'provider-op' }) };
  const reconciliation = { openOrRefreshCase: vi.fn().mockResolvedValue({ id: 'case-1' }),
    recordObservation: vi.fn().mockResolvedValue({}), recordOperationResult: vi.fn().mockResolvedValue({}) };
  const runner = new PaymentReconciliationRunner(prisma as never, adapter as never, reconciliation as never);
  return { query, prisma, adapter, reconciliation, runner };
}

describe('Payment reconciliation runner financial boundary', () => {
  beforeEach(() => {
    vi.stubEnv('PAYMENT_RECONCILIATION_MAX_ATTEMPTS', '5');
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it('calls only bounded worker capabilities with the configured stale interval', async () => {
    vi.stubEnv('PAYMENT_RECONCILIATION_INTERVAL_MS', '300000');
    const { runner, query, prisma } = fixture();
    await runner.runOnce();
    const calls = query.mock.calls.map(([sql]) => sql as { strings: readonly string[]; values: unknown[] });
    expect(calls).toHaveLength(2);
    expect(calls[0].strings.join(' ')).toContain('public.aaraagate_claim_payment_gateway_operations()');
    expect(calls[0].values).toEqual([]);
    expect(calls[1].strings.join(' ')).toContain('public.aaraagate_claim_payment_reconciliation_cases(');
    expect(calls[1].values).toEqual([300]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('does not fall back to unrestricted SQL when a claim capability is denied', async () => {
    const { runner, query, prisma, adapter } = fixture();
    query.mockReset().mockRejectedValue(new Error('execution denied'));
    await runner.runOnce();
    expect(query).toHaveBeenCalledOnce();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(adapter.refund).not.toHaveBeenCalled();
    expect(adapter.queryPayment).not.toHaveBeenCalled();
  });

  it('does not schedule or query when the provider is unconfigured', () => {
    const { runner, adapter, prisma } = fixture();
    adapter.isConfigured.mockReturnValue(false);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    runner.onModuleInit();
    runner.onModuleDestroy();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('runs immediately, schedules later work and stops the timer on shutdown', async () => {
    vi.useFakeTimers();
    vi.stubEnv('PAYMENT_RECONCILIATION_INTERVAL_MS', '60000');
    const { runner, query, prisma } = fixture();
    query.mockReset().mockResolvedValue([]);
    runner.onModuleInit();
    await vi.advanceTimersByTimeAsync(0);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60000);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
    runner.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(60000);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
  });

  it('does not overlap an active cycle and recovers after a claim failure', async () => {
    const { runner, query, prisma } = fixture();
    let release!: (rows: unknown[]) => void;
    query.mockReset().mockResolvedValue([]).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const pending = runner.runOnce();
    await runner.runOnce();
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    release([]);
    await pending;
    expect(query).toHaveBeenCalledTimes(2);
    query.mockReset().mockRejectedValueOnce(new Error('private database details'));
    await runner.runOnce();
    expect(query).toHaveBeenCalledOnce();
    expect(Logger.prototype.error).toHaveBeenCalledWith('Payment reconciliation cycle failed: Error');
    query.mockReset().mockResolvedValue([]);
    await runner.runOnce();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it.each([null, 0n, -1n, BigInt(Number.MAX_SAFE_INTEGER) + 1n, 9223372036854775807n])(
    'never sends an unsafe stored refund amount %s to the provider', async amount => {
      const { runner, adapter, reconciliation } = fixture([operation({ amountPaise: amount })]);
      await runner.runOnce();
      expect(adapter.refund).not.toHaveBeenCalled();
      expect(reconciliation.recordOperationResult).toHaveBeenCalledExactlyOnceWith(society, 'op-1',
        { status: 'UNKNOWN', failureCode: 'RUNNER_RETRY', failureMessage: 'Error' });
    },
  );

  it.each([1n, BigInt(Number.MAX_SAFE_INTEGER)])('preserves exact valid stored refund %s and retry identity', async amount => {
    const { runner, adapter, reconciliation } = fixture([operation({ amountPaise: amount, providerOperationId: 'existing-provider-op' })]);
    await runner.runOnce();
    expect(adapter.refund).toHaveBeenCalledExactlyOnceWith({ paymentId: 'payment-1', amountPaise: Number(amount),
      providerOperationId: 'existing-provider-op', idempotencyKey: 'stored-key' });
    expect(reconciliation.recordOperationResult).toHaveBeenCalledWith(society, 'op-1', { status: 'ACCEPTED', providerOperationId: 'provider-op' });

  });

  it('records exhausted invalid refunds without external action and continues the claimed batch', async () => {
    const { runner, adapter, reconciliation } = fixture([
      operation({ amountPaise: BigInt(Number.MAX_SAFE_INTEGER) + 1n, attemptCount: 4 }), operation({ id: 'op-2', attemptCount: 2 }),
    ]);
    await runner.runOnce();
    expect(reconciliation.recordOperationResult).toHaveBeenCalledWith(society, 'op-1',
      { status: 'FAILED', failureCode: 'RUNNER_EXHAUSTED', failureMessage: 'Error' });
    expect(adapter.refund).toHaveBeenCalledOnce();
    expect(reconciliation.recordOperationResult).toHaveBeenCalledWith(society, 'op-2', expect.objectContaining({ status: 'ACCEPTED' }));
  });

  it('keeps a failed evidence write from stopping the next claimed refund', async () => {
    const { runner, adapter, reconciliation } = fixture([operation({ amountPaise: null }), operation({ id: 'op-2' })]);
    reconciliation.recordOperationResult.mockRejectedValueOnce(new Error('database failed with sensitive payload'));
    await runner.runOnce();
    expect(adapter.refund).toHaveBeenCalledOnce();
    expect(Logger.prototype.error).toHaveBeenCalledWith('Could not persist gateway retry result op-1: Error');
    expect(reconciliation.recordOperationResult).toHaveBeenCalledTimes(2);
  });

  it('retains retry/backoff and sanitizes uncertain provider failure evidence', async () => {
    const { runner, adapter, reconciliation } = fixture([operation({ attemptCount: 2 })]);
    adapter.refund.mockRejectedValueOnce(new Error('private token and provider payload'));
    await runner.runOnce();

    expect(reconciliation.recordOperationResult).toHaveBeenCalledWith(society, 'op-1',
      { status: 'UNKNOWN', failureCode: 'RUNNER_RETRY', failureMessage: 'Error' });
  });

  it('routes status observations and settlement through the claimed society', async () => {
    const { runner, adapter, reconciliation } = fixture([operation({ operationType: 'STATUS_QUERY', amountPaise: null })]);
    await runner.runOnce();
    expect(adapter.refund).not.toHaveBeenCalled();
    expect(reconciliation.openOrRefreshCase).toHaveBeenCalledWith(society, 'payment-1', 'test-provider');
    expect(reconciliation.recordObservation).toHaveBeenCalledWith(society, 'case-1',
      { providerPaymentId: 'provider-pay', observedProviderStatus: 'CAPTURED', observedAmountPaise: 500 });
    expect(reconciliation.recordOperationResult).toHaveBeenCalledWith(society, 'op-1', { status: 'SETTLED', providerOperationId: undefined });
  });

  it('refreshes only supported cases using their own society', async () => {
    const { runner, adapter, reconciliation } = fixture([], [
      { id: 'case-other', societyId: 'society-other', paymentId: 'other-payment', provider: 'unsupported' },
      { id: 'case-b', societyId: 'society-b', paymentId: 'payment-b', provider: 'test-provider' },
    ]);
    await runner.runOnce();
    expect(adapter.queryPayment).toHaveBeenCalledExactlyOnceWith('payment-b');
    expect(reconciliation.recordObservation).toHaveBeenCalledWith('society-b', 'case-b', expect.any(Object));
  });

  it.each([0, 4])('retains unsupported-provider handling at attempt %s', async priorAttempts => {
    const { runner, adapter, reconciliation } = fixture([operation({ provider: 'other-provider', attemptCount: priorAttempts })]);
    await runner.runOnce();
    expect(adapter.refund).not.toHaveBeenCalled();
    expect(adapter.queryPayment).not.toHaveBeenCalled();
    expect(reconciliation.recordOperationResult).toHaveBeenCalledWith(society, 'op-1', {
      status: priorAttempts === 4 ? 'FAILED' : 'UNKNOWN', failureCode: 'UNSUPPORTED_PROVIDER', failureMessage: 'No configured adapter for other-provider',
    });
  });

  it('keeps failed case refresh evidence free of provider payloads', async () => {
    const { runner, adapter, reconciliation } = fixture([], [{ id: 'case-1', societyId: society, paymentId: 'payment-1', provider: 'test-provider' }]);
    adapter.queryPayment.mockRejectedValueOnce(new Error('private provider payload'));
    await runner.runOnce();
    expect(reconciliation.recordObservation).not.toHaveBeenCalled();
    expect(Logger.prototype.warn).toHaveBeenCalledWith('Reconciliation case case-1 refresh failed: Error');
  });
});
