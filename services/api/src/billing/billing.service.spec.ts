import { createHash, createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';

describe('BillingService', () => {
  const previousSecret = process.env.PAYMENT_WEBHOOK_SECRET;
  afterEach(() => {
    if (previousSecret === undefined) delete process.env.PAYMENT_WEBHOOK_SECRET;
    else process.env.PAYMENT_WEBHOOK_SECRET = previousSecret;
  });
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

  it('lists payable invoices for verified owners or current tenants only', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new BillingService(prisma as unknown as PrismaService);
    await service.listPayable('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
    const sql = (prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(sql).toContain('"UnitOwnership"');
    expect(sql).toContain('uo."verified" = true');
    expect(sql).toContain('"UnitOccupancy"');
    expect(sql).toContain('ur."relation" = \'TENANT\'');
  });

  it('summarizes resident finance without widening payer-private payment evidence', async () => {
    const prisma = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([
          {id:'invoice-1',unitId:'unit-1',amountPaise:120000,status:'ISSUED',dueDate:'2026-09-01'},
          {id:'invoice-2',unitId:'unit-2',amountPaise:45000,status:'ISSUED',dueDate:'2026-10-01'},
        ])
        .mockResolvedValueOnce([
          {invoiceId:'invoice-1',amountPaise:120000,status:'FAILED',createdAt:'2026-09-20T00:00:00.000Z',completedAt:null},
          {invoiceId:'invoice-2',amountPaise:45000,status:'CAPTURED',createdAt:'2026-09-10T00:00:00.000Z',completedAt:'2026-09-10T00:05:00.000Z'},
        ]),
    };
    const service=new BillingService(prisma as unknown as PrismaService);
    const result=await service.residentSummary('society-1','user-1','unit-1');
    expect(result).toEqual(expect.objectContaining({
      unitId:'unit-1',outstandingPaise:120000,openInvoiceCount:1,paymentRecoveryCount:1,
      checkoutPolicy:expect.objectContaining({mode:'FULL_INVOICE',residentPartialPayment:false,advanceBalanceVisibility:false,payerPrivateEvidence:true}),
    }));
    expect(result.capturedPaymentCount).toBe(0);
  });

  it('rejects invalid invoice amounts before persistence', async () => {
    const prisma = { $transaction: vi.fn() };
    const service = new BillingService(prisma as unknown as PrismaService);
    await expect(service.issue('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',{
      unitId:'33333333-3333-3333-3333-333333333333', billingPeriod:'2026-09', amountPaise:99, dueDate:'2026-09-30',
    })).rejects.toThrow('Invoice amount must be at least one rupee');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not expose a cross-tenant invoice for payment', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]), $transaction: vi.fn() };
    const service = new BillingService(prisma as unknown as PrismaService);
    await expect(service.createPayment('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','payment-key-123')).rejects.toThrow('Invoice not found');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    const sql = (prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(sql).toContain('"UnitOwnership"');
    expect(sql).toContain('uo."verified" = true');
    expect(sql).toContain('"UnitOccupancy"');
    expect(sql).toContain('ur."relation" = \'TENANT\'');
  });

  it('notifies the verified owner and current tenant when dues are issued', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: '33333333-3333-3333-3333-333333333333' }])
        .mockResolvedValueOnce([{ id: 'invoice-1', invoiceNumber: '202609-33333333', amountPaise: 125000 }])
        .mockResolvedValueOnce([{ userId: 'owner-1' }, { userId: 'tenant-1' }]),
    };
    const prisma = { $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)) };
    const realtime = { publishResident: vi.fn() };
    const service = new BillingService(prisma as unknown as PrismaService, realtime as never);
    await service.issue('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', {
      unitId: '33333333-3333-3333-3333-333333333333', billingPeriod: '2026-09', amountPaise: 125000, dueDate: '2026-09-30',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(realtime.publishResident).toHaveBeenCalledTimes(2);
    expect(realtime.publishResident).toHaveBeenCalledWith(expect.objectContaining({ type: 'MAINTENANCE_DUE_ISSUED', userId: 'owner-1' }));
    expect(realtime.publishResident).toHaveBeenCalledWith(expect.objectContaining({ type: 'MAINTENANCE_DUE_ISSUED', userId: 'tenant-1' }));
  });

  it('keeps invoice creation and recipient resolution in one transaction', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: '33333333-3333-3333-3333-333333333333' }])
        .mockResolvedValueOnce([{ id: 'invoice-1', invoiceNumber: '202609-33333333', amountPaise: 125000 }])
        .mockRejectedValueOnce(new Error('recipient lookup failed')),
    };
    const prisma = { $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)) };
    const realtime = { publishResident: vi.fn() };
    const service = new BillingService(prisma as unknown as PrismaService, realtime as never);

    await expect(service.issue('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', {
      unitId: '33333333-3333-3333-3333-333333333333', billingPeriod: '2026-09', amountPaise: 125000, dueDate: '2026-09-30',
    })).rejects.toThrow('recipient lookup failed');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(realtime.publishResident).not.toHaveBeenCalled();
  });

  it('rejects an idempotency key reused for another invoice', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: '33333333-3333-3333-3333-333333333333', amountPaise: 1000, status: 'ISSUED' }])
        .mockResolvedValueOnce([{ invoiceId: '44444444-4444-4444-4444-444444444444' }]),
      $executeRaw: vi.fn(),
    };
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: '33333333-3333-3333-3333-333333333333' }]),
      $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)),
    };
    const service = new BillingService(prisma as unknown as PrismaService);
    await expect(service.createPayment(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333',
      'payment-key-123',
    )).rejects.toThrow('Idempotency key is already used for another invoice');
    const lockSql=(tx.$queryRaw.mock.calls[0][0] as {strings:readonly string[]}).strings.join(' ');
    expect(lockSql).toContain('FOR UPDATE');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('reuses an active payment order for the same payer even when the retry key changes', async () => {
    const active={id:'payment-1',invoiceId:'33333333-3333-3333-3333-333333333333',payerUserId:'22222222-2222-2222-2222-222222222222',status:'CREATED',providerOrderId:'order-1'};
    const tx={
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([{id:active.invoiceId,amountPaise:1000,status:'ISSUED'}])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([active]),
      $executeRaw:vi.fn(),
    };
    const prisma={
      $queryRaw:vi.fn().mockResolvedValue([{id:active.invoiceId}]),
      $transaction:vi.fn((run:(client:typeof tx)=>unknown)=>run(tx)),
    };
    const service=new BillingService(prisma as unknown as PrismaService);
    await expect(service.createPayment(
      '11111111-1111-1111-1111-111111111111',active.payerUserId,active.invoiceId,'new-retry-key',
    )).resolves.toEqual(active);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('serializes an invoice and blocks a second payer while another payment order is active', async () => {
    const invoiceId='33333333-3333-3333-3333-333333333333';
    const tx={
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([{id:invoiceId,amountPaise:1000,status:'ISSUED'}])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{id:'payment-1',invoiceId,payerUserId:'owner-user',status:'CREATED'}]),
      $executeRaw:vi.fn(),
    };
    const prisma={
      $queryRaw:vi.fn().mockResolvedValue([{id:invoiceId}]),
      $transaction:vi.fn((run:(client:typeof tx)=>unknown)=>run(tx)),
    };
    const service=new BillingService(prisma as unknown as PrismaService);
    await expect(service.createPayment(
      '11111111-1111-1111-1111-111111111111','tenant-user',invoiceId,'tenant-attempt-key',
    )).rejects.toThrow('Payment is already in progress for this invoice');
    const lockSql=(tx.$queryRaw.mock.calls[0][0] as {strings:readonly string[]}).strings.join(' ');
    expect(lockSql).toContain('FOR UPDATE');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejects unsigned gateway callbacks before database access', async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'test-secret';
    const prisma = { $transaction: vi.fn() };
    const service = new BillingService(prisma as unknown as PrismaService);
    await expect(service.reconcile(undefined, {
      eventId: 'evt-1', providerOrderId: 'order-1', providerPaymentId: 'payment-1', status: 'CAPTURED',
    })).rejects.toThrow('Invalid payment signature');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps tenant payment history payer-own while verified owners retain property visibility', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new BillingService(prisma as unknown as PrismaService);
    await service.listPaymentsMine('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
    await expect(service.getReceipt('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333')).rejects.toThrow('Receipt not found');
    for (const [query] of prisma.$queryRaw.mock.calls) {
      const sql = (query as { strings: readonly string[] }).strings.join(' ');
      expect(sql).toContain('p."payerUserId"');
      expect(sql).toContain('"UnitOwnership"');
      expect(sql).toContain('uo."userId"');
      expect(sql).toContain('uo."verified" = true');
      expect(sql).not.toContain('"UnitOccupancy"');
      expect(sql).not.toContain('"UnitResident"');
    }
  });

  it('acknowledges a previously processed signed webhook without mutating payment state', async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'test-secret';
    const event = { eventId: 'evt-1', providerOrderId: 'order-1', providerPaymentId: 'payment-1', status: 'CAPTURED' as const };
    const signature = createHmac('sha256', 'test-secret').update('evt-1|order-1|payment-1|CAPTURED').digest('hex');
    const actualDigest = createHash('sha256').update('evt-1|order-1|payment-1|CAPTURED').digest('hex');
    const prisma = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: '33333333-3333-3333-3333-333333333333', invoiceId: '44444444-4444-4444-4444-444444444444', societyId: '11111111-1111-1111-1111-111111111111', status: 'CAPTURED' }])
        .mockResolvedValueOnce([{ id: '55555555-5555-4555-8555-555555555555', societyId: '11111111-1111-1111-1111-111111111111', paymentId: '33333333-3333-3333-3333-333333333333', payloadDigest: actualDigest, processingStatus: 'PROCESSED' }]),
      $transaction: vi.fn(),
    };
    const service = new BillingService(prisma as unknown as PrismaService);
    await expect(service.reconcile(signature, event)).resolves.toEqual({ duplicate: true, receiptId: '55555555-5555-4555-8555-555555555555' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
