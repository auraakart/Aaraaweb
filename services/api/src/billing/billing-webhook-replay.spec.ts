import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BillingService, type PaymentWebhookEvent } from './billing.service';

const societyId = '11111111-1111-4111-8111-111111111111';
const paymentId = '22222222-2222-4222-8222-222222222222';
const receiptId = '33333333-3333-4333-8333-333333333333';
const actorId = '44444444-4444-4444-8444-444444444444';

const event: PaymentWebhookEvent = {
  eventId: 'evt-100',
  providerOrderId: 'order-100',
  providerPaymentId: 'pay-100',
  status: 'CAPTURED',
};

describe('BillingService webhook replay reliability', () => {
  it('persists a verified callback before applying the normal payment transition', async () => {
    const previous = process.env.PAYMENT_WEBHOOK_SECRET;
    process.env.PAYMENT_WEBHOOK_SECRET = 'test-webhook-secret';
    try {
      const crypto = await import('node:crypto');
      const canonical = 'evt-100|order-100|pay-100|CAPTURED';
      const signature = crypto.createHmac('sha256', 'test-webhook-secret').update(canonical).digest('hex');
      const digest = crypto.createHash('sha256').update(canonical).digest('hex');
      const tx = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([{ id: receiptId, societyId, paymentId, payloadDigest: digest, processingStatus: 'RECEIVED' }])
          .mockResolvedValueOnce([{ id: paymentId, invoiceId: '55555555-5555-4555-8555-555555555555', societyId, status: 'CREATED' }])
          .mockResolvedValueOnce([{ id: 'event-row' }])
          .mockResolvedValueOnce([{ id: paymentId, invoiceId: '55555555-5555-4555-8555-555555555555', societyId }]),
        $executeRaw: vi.fn().mockResolvedValue(1),
      };
      const prisma = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([{ id: paymentId, invoiceId: '55555555-5555-4555-8555-555555555555', societyId, status: 'CREATED' }])
          .mockResolvedValueOnce([{ id: receiptId, societyId, paymentId, payloadDigest: digest, processingStatus: 'RECEIVED' }]),
        $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)),
        $executeRaw: vi.fn(),
      };
      const service = new BillingService(prisma as never);
      await expect(service.reconcile(signature, event)).resolves.toEqual({ ok: true, paymentId, status: 'CAPTURED', receiptId });
      const receiptSql = (prisma.$queryRaw.mock.calls[1][0] as { strings: readonly string[] }).strings.join(' ');
      expect(receiptSql).toContain('INSERT INTO "PaymentWebhookReceipt"');
      expect(receiptSql).toContain('ON CONFLICT ("providerEventId")');
    } finally {
      if (previous === undefined) delete process.env.PAYMENT_WEBHOOK_SECRET;
      else process.env.PAYMENT_WEBHOOK_SECRET = previous;
    }
  });

  it('rejects a provider event id reused with a different signed payload', async () => {
    const previous = process.env.PAYMENT_WEBHOOK_SECRET;
    process.env.PAYMENT_WEBHOOK_SECRET = 'test-webhook-secret';
    try {
      const crypto = await import('node:crypto');
      const canonical = 'evt-100|order-100|pay-100|CAPTURED';
      const signature = crypto.createHmac('sha256', 'test-webhook-secret').update(canonical).digest('hex');
      const prisma = {
        $queryRaw: vi.fn()
          .mockResolvedValueOnce([{ id: paymentId, invoiceId: '55555555-5555-4555-8555-555555555555', societyId, status: 'CREATED' }])
          .mockResolvedValueOnce([{ id: receiptId, societyId, paymentId, payloadDigest: 'b'.repeat(64), processingStatus: 'FAILED' }]),
        $transaction: vi.fn(),
      };
      const service = new BillingService(prisma as never);
      await expect(service.reconcile(signature, event)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.PAYMENT_WEBHOOK_SECRET;
      else process.env.PAYMENT_WEBHOOK_SECRET = previous;
    }
  });
  it('keeps receipt visibility tenant-scoped', async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const service = new BillingService({ $queryRaw: queryRaw } as never);
    await service.listWebhookReceipts(societyId);
    const sql = (queryRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(sql).toContain('r."societyId"=');
  });

  it('does not replay a receipt outside the current society', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]), $transaction: vi.fn() };
    const service = new BillingService(prisma as never);
    await expect(service.replayWebhookReceipt(societyId, actorId, receiptId)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    const sql = (prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(sql).toContain('"societyId"=');
  });

  it('replays a stored event through the normal payment transition', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: receiptId, societyId, paymentId, payloadDigest: 'a'.repeat(64), processingStatus: 'FAILED' }])
        .mockResolvedValueOnce([{ id: paymentId, invoiceId: '55555555-5555-4555-8555-555555555555', societyId, status: 'CREATED' }])
        .mockResolvedValueOnce([{ id: 'event-row' }])
        .mockResolvedValueOnce([{ id: paymentId, invoiceId: '55555555-5555-4555-8555-555555555555', societyId }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ payload: event }]),
      $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)),
      $executeRaw: vi.fn(),
    };
    const service = new BillingService(prisma as never);

    await expect(service.replayWebhookReceipt(societyId, actorId, receiptId)).resolves.toEqual({
      ok: true,
      paymentId,
      status: 'CAPTURED',
      receiptId,
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(4);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    const transitionSql = (tx.$queryRaw.mock.calls[3][0] as { strings: readonly string[] }).strings.join(' ');
    expect(transitionSql).toContain('UPDATE "Payment"');
    expect(transitionSql).toContain('"status" IN (\'CREATED\',\'AUTHORIZED\')');
  });

  it('persists processing failure evidence when replay cannot satisfy the payment state machine', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: receiptId, societyId, paymentId, payloadDigest: 'a'.repeat(64), processingStatus: 'FAILED' }])
        .mockResolvedValueOnce([{ id: paymentId, invoiceId: '55555555-5555-4555-8555-555555555555', societyId, status: 'REFUNDED' }])
        .mockResolvedValueOnce([{ id: 'event-row' }])
        .mockResolvedValueOnce([]),
      $executeRaw: vi.fn(),
    };
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ payload: event }]),
      $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const service = new BillingService(prisma as never);

    await expect(service.replayWebhookReceipt(societyId, actorId, receiptId)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$executeRaw).toHaveBeenCalledOnce();
    const failureSql = (prisma.$executeRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(failureSql).toContain('"processingStatus"=\'FAILED\'');
    expect(failureSql).toContain('"lastError"=');
  });
});
