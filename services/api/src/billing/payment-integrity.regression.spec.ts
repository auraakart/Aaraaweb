import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BillingService } from './billing.service';
import { PaymentOrderService } from './payment-order.service';

const societyId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const invoiceId = '33333333-3333-4333-8333-333333333333';
const otherInvoiceId = '44444444-4444-4444-8444-444444444444';

function fixture(status: string, existing: unknown[] = [], inserted: unknown[] = []) {
  const tx = {
    $queryRaw: vi.fn()
      .mockResolvedValueOnce([{ id: invoiceId, amountPaise: 1000, status }])
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(inserted),
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: invoiceId }]),
    $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  return { tx, service: new PaymentOrderService(prisma as never) };
}

describe('Payment integrity regressions', () => {
  it('returns the original order on an authorized same-key retry after capture', async () => {
    const original = { id: 'payment-1', invoiceId, status: 'CAPTURED' };
    const { tx, service } = fixture('PAID', [original]);
    await expect(service.createPayment(societyId, userId, invoiceId, 'retry-key')).resolves.toEqual(original);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejects a new payment on a paid invoice', async () => {
    const { tx, service } = fixture('PAID');
    await expect(service.createPayment(societyId, userId, invoiceId, 'new-key')).rejects.toThrow('Invoice is not payable');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejects a conflicting key even when the requested invoice is already paid', async () => {
    const { tx, service } = fixture('PAID', [{ id: 'payment-2', invoiceId: otherInvoiceId }]);
    await expect(service.createPayment(societyId, userId, invoiceId, 'retry-key')).rejects.toThrow('Idempotency key is already used for another invoice');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejects the conflict winner from another invoice before recording an order event', async () => {
    // Separate invoice locks allow both requests to pass the initial key lookup.
    // The unique key constraint then returns the concurrent transaction's row.
    const { tx, service } = fixture('ISSUED', [], [{ id: 'payment-2', invoiceId: otherInvoiceId }]);
    await expect(service.createPayment(societyId, userId, invoiceId, 'shared-key')).rejects.toThrow('Idempotency key is already used for another invoice');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('creates the normal order and its audit event', async () => {
    const order = { id: 'payment-1', invoiceId, status: 'CREATED' };
    const { tx, service } = fixture('ISSUED', [], [order]);
    await expect(service.createPayment(societyId, userId, invoiceId, 'new-key')).resolves.toEqual(order);
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });

  it.each(['é'.repeat(64), 'g'.repeat(64), 'a'.repeat(63), 'a'.repeat(65)])(
    'rejects malformed webhook signature before database access: %s', async (signature) => {
      const previous = process.env.PAYMENT_WEBHOOK_SECRET;
      process.env.PAYMENT_WEBHOOK_SECRET = 'test-secret';
      try {
        const prisma = { $queryRaw: vi.fn(), $transaction: vi.fn() };
        const service = new BillingService(prisma as never);
        await expect(service.reconcile(signature, {
          eventId: 'evt-1', providerOrderId: 'order-1', providerPaymentId: 'pay-1', status: 'CAPTURED',
        })).rejects.toBeInstanceOf(UnauthorizedException);
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
      } finally {
        if (previous === undefined) delete process.env.PAYMENT_WEBHOOK_SECRET;
        else process.env.PAYMENT_WEBHOOK_SECRET = previous;
      }
    },
  );
});
