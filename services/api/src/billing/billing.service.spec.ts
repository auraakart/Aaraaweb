import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';

describe('BillingService', () => {
  it('authorizes resident finance through current ownership, never legacy residency', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new BillingService(prisma as unknown as PrismaService);
    await service.listMine('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
    const query = prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[] };
    const sql = query.strings.join(' ');
    expect(sql).toContain('"UnitOwnership"');
    expect(sql).toContain('"effectiveFrom" <= CURRENT_TIMESTAMP');
    expect(sql).not.toContain('"UnitResident"');
  });

  it('rejects invalid invoice amounts before persistence', async () => {
    const prisma = { $queryRaw: vi.fn() };
    const service = new BillingService(prisma as unknown as PrismaService);
    await expect(service.issue('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',{
      unitId:'33333333-3333-3333-3333-333333333333', billingPeriod:'2026-09', amountPaise:99, dueDate:'2026-09-30',
    })).rejects.toThrow('Invoice amount must be at least one rupee');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('does not expose a cross-tenant invoice for payment', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]), $transaction: vi.fn() };
    const service = new BillingService(prisma as unknown as PrismaService);
    await expect(service.createPayment('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','payment-key-123')).rejects.toThrow('Invoice not found');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects unsigned gateway callbacks before database access', async () => {
    const previous = process.env.PAYMENT_WEBHOOK_SECRET;
    process.env.PAYMENT_WEBHOOK_SECRET = 'test-secret';
    const prisma = { $transaction: vi.fn() };
    const service = new BillingService(prisma as unknown as PrismaService);
    await expect(service.reconcile(undefined, {
      eventId: 'evt-1', providerOrderId: 'order-1', providerPaymentId: 'payment-1', status: 'CAPTURED',
    })).rejects.toThrow('Invalid payment signature');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    if (previous === undefined) delete process.env.PAYMENT_WEBHOOK_SECRET;
    else process.env.PAYMENT_WEBHOOK_SECRET = previous;
  });
});
