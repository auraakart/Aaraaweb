import { describe, expect, it, vi } from 'vitest';
import { PaymentWebhookProcessor } from './payment-webhook.processor';

const society = '11111111-1111-4111-8111-111111111111';
const receipt = '22222222-2222-4222-8222-222222222222';
const payment = '33333333-3333-4333-8333-333333333333';
const event = { eventId: 'event', providerOrderId: 'order', providerPaymentId: 'payment', status: 'REFUNDED' as const };
const received = { id: receipt, societyId: society, paymentId: payment, payloadDigest: 'digest', processingStatus: 'RECEIVED' };
const order = { id: payment, societyId: society, purposeType: 'MAINTENANCE_INVOICE', invoiceId: 'invoice', amenityBookingId: null, status: 'CAPTURED' };

function setup(responses: unknown[]) {
  const tx = { $queryRaw: vi.fn(), $executeRaw: vi.fn().mockResolvedValue(1) };
  for (const response of responses) tx.$queryRaw.mockResolvedValueOnce(response);
  const prisma = {
    $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)),
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  return { tx, prisma, processor: new PaymentWebhookProcessor(prisma as never) };
}

describe('PaymentWebhookProcessor transition and recovery boundaries', () => {
  it('does not apply a missing or foreign receipt and records failure only in its scope', async () => {
    const { processor, tx, prisma } = setup([[]]);
    await expect(processor.process(society, receipt, event)).rejects.toThrow('receipt not found');
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    const query = prisma.$executeRaw.mock.calls[0][0];
    expect(query.strings.join(' ')).toContain('AND "societyId"=');
    expect(query.values).toContain(society);
  });

  it('returns processed receipts without another payment mutation', async () => {
    const { processor, tx } = setup([[{ ...received, processingStatus: 'PROCESSED' }]]);
    await expect(processor.process(society, receipt, event)).resolves.toEqual({ duplicate: true, receiptId: receipt });
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejects a missing order before claiming or transitioning an event', async () => {
    const { processor, tx } = setup([[received], []]);
    await expect(processor.process(society, receipt, event)).rejects.toThrow('order not found');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('acknowledges a previously claimed provider event without updating payment state', async () => {
    const { processor, tx } = setup([[received], [order], []]);
    await expect(processor.process(society, receipt, event)).resolves.toEqual({ duplicate: true, receiptId: receipt });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(tx.$executeRaw.mock.calls[0][0].strings.join(' ')).toContain('UPDATE "PaymentWebhookReceipt"');
  });

  it.each(['MAINTENANCE_INVOICE', 'AMENITY_DEPOSIT'])('routes refunds only to the matching %s record', async purposeType => {
    const target = { ...order, purposeType, invoiceId: purposeType === 'MAINTENANCE_INVOICE' ? 'invoice' : null,
      amenityBookingId: purposeType === 'AMENITY_DEPOSIT' ? 'booking' : null };
    const { processor, tx } = setup([[received], [target], [{ id: 'claimed-event' }], [target]]);
    await expect(processor.process(society, receipt, event)).resolves.toMatchObject({ status: 'REFUNDED' });
    const effects = tx.$executeRaw.mock.calls.map(([query]) => query.strings.join(' '));
    expect(effects.some(sql => sql.includes('UPDATE "MaintenanceInvoice"'))).toBe(purposeType === 'MAINTENANCE_INVOICE');
    expect(effects.some(sql => sql.includes('UPDATE "AmenityBooking"'))).toBe(purposeType === 'AMENITY_DEPOSIT');
    expect(effects[0]).toContain(purposeType === 'MAINTENANCE_INVOICE' ? '"status"=\'ISSUED\'' : '"depositStatus"=\'REFUNDED\'');
  });

  it('preserves the original processing error when recording failure also fails', async () => {
    const { processor, prisma } = setup([]);
    prisma.$transaction.mockRejectedValueOnce(new Error('original processing failure'));
    prisma.$executeRaw.mockRejectedValueOnce(new Error('failure recording unavailable'));
    await expect(processor.process(society, receipt, event)).rejects.toThrow('original processing failure');
  });
});
