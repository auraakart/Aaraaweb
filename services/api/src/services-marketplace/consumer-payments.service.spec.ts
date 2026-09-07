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
    prisma,
    service: new ConsumerPaymentsService(
      prisma as unknown as ConstructorParameters<typeof ConsumerPaymentsService>[0],
    ),
  };
}

function sqlValues(call: unknown): unknown[] {
  return (call as { values?: unknown[] }).values ?? [];
}

const userId = '11111111-1111-1111-1111-111111111111';
const bookingId = '22222222-2222-2222-2222-222222222222';

const payment = {
  id: '33333333-3333-3333-3333-333333333333',
  bookingId,
  userId,
  idempotencyKey: 'payment-key-001',
  status: 'CREATED',
  currency: 'INR',
  grossAmountPaise: 75000,
  platformFeePaise: null,
  providerAmountPaise: null,
};

describe('ConsumerPaymentsService', () => {
  it('scopes payment listing to the authenticated user', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValue([]);

    await service.listMine(userId);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(sqlValues(prisma.$queryRaw.mock.calls[0][0])).toContain(userId);
  });

  it('rejects payment creation when the booking is not owned by the authenticated user', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(service.createIntent(userId, bookingId, 'payment-key-001')).rejects.toThrow('Booking not found');

    const bookingLookupValues = sqlValues(tx.$queryRaw.mock.calls[1][0]);
    expect(bookingLookupValues).toContain(userId);
    expect(bookingLookupValues).toContain(bookingId);
  });

  it('returns the same payment for an idempotent retry on the same booking', async () => {
    const { tx, service } = setup();
    tx.$queryRaw.mockResolvedValueOnce([payment]);

    const result = await service.createIntent(userId, bookingId, 'payment-key-001');

    expect(result.id).toBe(payment.id);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key for another booking', async () => {
    const { tx, service } = setup();
    tx.$queryRaw.mockResolvedValueOnce([payment]);

    await expect(
      service.createIntent(userId, '44444444-4444-4444-4444-444444444444', 'payment-key-001'),
    ).rejects.toThrow('Idempotency key is already used for another booking');
  });

  it('copies the immutable booking amount and records an append-only creation event', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: bookingId, userId, status: 'REQUESTED', servicePricePaise: 75000 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([payment]);
    tx.$executeRaw.mockResolvedValue(1);

    const result = await service.createIntent(userId, bookingId, 'payment-key-001');

    expect(result.grossAmountPaise).toBe(75000);
    const insertValues = sqlValues(tx.$queryRaw.mock.calls[3][0]);
    expect(insertValues).toContain(75000);
    expect(insertValues).toContain('INR');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('does not create a payment intent for a cancelled booking', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: bookingId, userId, status: 'CANCELLED', servicePricePaise: 75000 }]);

    await expect(service.createIntent(userId, bookingId, 'payment-key-001')).rejects.toThrow(
      'Cancelled booking cannot create a payment intent',
    );

    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
