import { createHash, createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BillingService } from './billing.service';
import { PaymentWebhookProcessor } from './payment-webhook.processor';

const society = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
const unit = '33333333-3333-4333-8333-333333333333';
const payment = '44444444-4444-4444-8444-444444444444';
const event = { eventId: 'event', providerOrderId: 'order', providerPaymentId: 'payment', status: 'CAPTURED' as const };

function fixture() {
  const tx = { $queryRaw: vi.fn().mockResolvedValue([]), $executeRaw: vi.fn().mockResolvedValue(1) };
  const prisma = {
    $queryRaw: vi.fn<(query: unknown) => Promise<unknown[]>>(async () => { throw new Error('Unscoped root read'); }),
    $executeRaw: vi.fn(async (): Promise<number> => { throw new Error('Unscoped root write'); }),
    $transaction: vi.fn(async (): Promise<unknown> => { throw new Error('Unscoped root transaction'); }),
    withTenantContext: vi.fn((_scope: string, run: (client: typeof tx) => unknown) => run(tx)),
  };
  return { tx, prisma, service: new BillingService(prisma as never) };
}

describe('Billing selected transaction client boundaries', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['owner invoices', (s: BillingService) => s.listMine(society, user)],
    ['payable invoices', (s: BillingService) => s.listPayable(society, user, unit)],
    ['society invoices', (s: BillingService) => s.listForSociety(society)],
    ['payment history', (s: BillingService) => s.listPaymentsMine(society, user, unit)],
    ['payment audit', (s: BillingService) => s.listPaymentAudit(society)],
    ['billable units', (s: BillingService) => s.listBillableUnits(society)],
    ['webhook receipts', (s: BillingService) => s.listWebhookReceipts(society)],
    ['private receipt', (s: BillingService) => s.getReceipt(society, user, payment)],
  ] as const)('runs %s only on the selected transaction client', async (_name, run) => {
    const { tx, prisma, service } = fixture();
    tx.$queryRaw.mockResolvedValue([{ paymentId: payment }]);
    await run(service);
    expect(prisma.withTenantContext).toHaveBeenCalledWith(society, expect.any(Function));
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it.each(['read', 'write'])('checks current payer and preference %s in the same transaction', async operation => {
    const { tx, prisma, service } = fixture();
    tx.$queryRaw.mockResolvedValueOnce([{ id: unit }]);
    const result = operation === 'read' ? await service.getAutopayPreference(society, user, unit)
      : await service.setAutopayPreference(society, user, { unitId: unit, enabled: true, debitDaysBefore: 1 });
    expect(result.automaticDebitAvailable).toBe(false);
    expect(prisma.withTenantContext).toHaveBeenCalledOnce();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('does not read or change preferences after payer authority is denied', async () => {
    const { tx, service } = fixture();
    await expect(service.setAutopayPreference(society, user, { unitId: unit, enabled: true, debitDaysBefore: 1 }))
      .rejects.toThrow('Current owner or tenant relationship is required');
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
  });

  it('does no billing work if tenant context cannot be established', async () => {
    const { tx, prisma, service } = fixture();
    prisma.withTenantContext.mockRejectedValueOnce(new Error('context unavailable'));
    await expect(service.listPayable(society, user)).rejects.toThrow('context unavailable');
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('uses the verified order society for callback receipt persistence', async () => {
    vi.stubEnv('PAYMENT_WEBHOOK_SECRET', 'test-only-secret');
    const canonical = 'event|order|payment|CAPTURED';
    const signature = createHmac('sha256', 'test-only-secret').update(canonical).digest('hex');
    const { tx, prisma } = fixture();
    prisma.$queryRaw.mockResolvedValueOnce([{ id: payment, societyId: society }]);
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'receipt', societyId: society, paymentId: payment,
      payloadDigest: createHash('sha256').update(canonical).digest('hex'), processingStatus: 'PROCESSED' }]);
    await expect(new BillingService(prisma as never).reconcile(signature, event)).resolves.toEqual({ duplicate: true, receiptId: 'receipt' });
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    const lookup = prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(lookup.strings.join(' ')).toContain('public.aaraagate_resolve_payment_webhook_order(');
    expect(lookup.strings.join(' ')).not.toContain('FROM "Payment"');
    expect(lookup.values).toEqual([event.providerOrderId]);
    expect(prisma.withTenantContext).toHaveBeenCalledWith(society, expect.any(Function));
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
  });

  it('rejects unsigned callbacks before global lookup or tenant work', async () => {
    vi.stubEnv('PAYMENT_WEBHOOK_SECRET', 'test-only-secret');
    const { prisma, service } = fixture();
    await expect(service.reconcile(undefined, event)).rejects.toThrow('Invalid payment signature');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
  });

  it.each(['missing', 'denied'])('fails closed when exact-order resolution is %s', async result => {
    vi.stubEnv('PAYMENT_WEBHOOK_SECRET', 'test-only-secret');
    const signature = createHmac('sha256', 'test-only-secret').update('event|order|payment|CAPTURED').digest('hex');
    const { prisma, service } = fixture();
    if (result === 'missing') prisma.$queryRaw.mockResolvedValueOnce([]);
    else prisma.$queryRaw.mockRejectedValueOnce(new Error('resolver execution denied'));
    await expect(service.reconcile(signature, event)).rejects.toThrow(result === 'missing' ? 'Payment order not found' : 'resolver execution denied');
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('records webhook processing failure through a fresh scoped transaction', async () => {
    const { tx, prisma } = fixture();
    const failure = { $executeRaw: vi.fn().mockResolvedValue(1) };
    prisma.withTenantContext.mockImplementationOnce((_scope, run) => run(tx))
      .mockImplementationOnce((_scope, run) => run(failure as never));
    await expect(new PaymentWebhookProcessor(prisma as never).process(society, unit, event)).rejects.toThrow('receipt not found');
    expect(prisma.withTenantContext.mock.calls.map(call => call[0])).toEqual([society, society]);
    expect(failure.$executeRaw).toHaveBeenCalledOnce();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});
