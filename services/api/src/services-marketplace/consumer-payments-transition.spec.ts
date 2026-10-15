import { describe, expect, it, vi } from 'vitest';
import { ConsumerPaymentsService } from './consumer-payments.service';

function setup() {
  const tx = { $queryRaw: vi.fn(), $executeRaw: vi.fn() };
  const prisma = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return {
    tx,
    service: new ConsumerPaymentsService(
      prisma as unknown as ConstructorParameters<typeof ConsumerPaymentsService>[0],
    ),
  };
}

const actorUserId = '11111111-1111-1111-1111-111111111111';
const paymentId = '22222222-2222-2222-2222-222222222222';

function payment(status: string) {
  return {
    id: paymentId,
    bookingId: '33333333-3333-3333-3333-333333333333',
    userId: '44444444-4444-4444-4444-444444444444',
    idempotencyKey: 'payment-key-001',
    status,
    currency: 'INR',
    grossAmountPaise: 75000,
    platformFeePaise: null,
    providerAmountPaise: null,
    provider: null,
    providerOrderId: null,
    providerPaymentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    capturedAt: null,
    refundedAt: null,
  };
}

describe('ConsumerPaymentsService transitions', () => {
  it('moves CREATED to PENDING atomically and records an audit event', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([payment('CREATED')])
      .mockResolvedValueOnce([payment('PENDING')]);
    tx.$executeRaw.mockResolvedValue(1);

    const result = await service.transition(actorUserId, paymentId, { status: 'PENDING' });

    expect(result.status).toBe('PENDING');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects skipping directly from CREATED to CAPTURED', async () => {
    const { tx, service } = setup();
    tx.$queryRaw.mockResolvedValueOnce([payment('CREATED')]);

    await expect(service.transition(actorUserId, paymentId, { status: 'CAPTURED' })).rejects.toThrow(
      'Invalid payment transition from CREATED to CAPTURED',
    );

    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('protects terminal REFUNDED payments from further mutation', async () => {
    const { tx, service } = setup();
    tx.$queryRaw.mockResolvedValueOnce([payment('REFUNDED')]);

    await expect(service.transition(actorUserId, paymentId, { status: 'FAILED' })).rejects.toThrow(
      'Invalid payment transition from REFUNDED to FAILED',
    );
  });

  it('treats a repeated provider event for the same payment as idempotent', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ paymentId }])
      .mockResolvedValueOnce([payment('PENDING')]);

    const result = await service.transition(actorUserId, paymentId, {
      status: 'PENDING',
      providerEventId: 'evt-001',
    });

    expect(result.status).toBe('PENDING');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
