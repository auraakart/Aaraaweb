import { describe, expect, it, vi } from 'vitest';
import { BillingService } from './billing.service';
import { PushDeliveryOutboxService } from '../notifications/push-delivery-outbox.service';
import { residentPushDedupeKey } from '../notifications/push-notification.service';
import type { ResidentMessageEvent } from '../notifications/notification-realtime.service';

const societyId = '11111111-1111-4111-8111-111111111111';
const unitId = '22222222-2222-4222-8222-222222222222';
const invoice = { id: 'invoice-1', invoiceNumber: '202610-unit', amountPaise: 1000 };
const input = { unitId, billingPeriod: '2026-10', amountPaise: 1000, dueDate: '2026-10-31' };

function fixture(failQueue = false) {
  let committed = false;
  const tx = {
    $queryRaw: vi.fn()
      .mockResolvedValueOnce([{ id: unitId }])
      .mockResolvedValueOnce([invoice])
      .mockResolvedValueOnce([{ userId: 'owner-1' }, { userId: 'tenant-1' }])
      .mockImplementation(async () => {
        expect(committed).toBe(false);
        if (failQueue) throw new Error('outbox unavailable');
        return [{ id: 'queued', status: 'PENDING' }];
      }),
  };
  const prisma = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(async (run: (client: typeof tx) => unknown) => {
      const result = await run(tx);
      committed = true;
      return result;
    }),
  };
  const realtime = { publishResident: vi.fn((event: ResidentMessageEvent) => {
    expect(committed).toBe(true);
    expect(event.societyId).toBe(societyId);
  }) };
  const outbox = new PushDeliveryOutboxService(prisma as never);
  return { tx, prisma, realtime, service: new BillingService(prisma as never, realtime as never, outbox) };
}

describe('Billing notification durability', () => {
  it('persists owner and tenant push intents in the invoice transaction before realtime dispatch', async () => {
    const { tx, prisma, realtime, service } = fixture();
    await expect(service.issue(societyId, 'actor-1', input)).resolves.toEqual(invoice);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(5);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(realtime.publishResident).toHaveBeenCalledTimes(2);
    for (const [index, [event]] of realtime.publishResident.mock.calls.entries()) {
      const queued = tx.$queryRaw.mock.calls[index + 3][0] as unknown as { strings: string[]; values: unknown[] };
      expect(queued.strings.join(' ')).toContain('INSERT INTO "PushDeliveryOutbox"');
      expect(queued.values).toContain(societyId);
      expect(queued.values).toContain(residentPushDedupeKey(event));
      expect(event).toMatchObject({ societyId, unitId, invoiceId: invoice.id });
    }
  });

  it('rejects issuance if durable push persistence fails without publishing uncommitted dues', async () => {
    const { prisma, realtime, service } = fixture(true);
    await expect(service.issue(societyId, 'actor-1', input)).rejects.toThrow('outbox unavailable');
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(realtime.publishResident).not.toHaveBeenCalled();
  });
});
