import { describe, expect, it, vi } from 'vitest';
import { ConsumerBookingsService } from './consumer-bookings.service';

function sqlText(call: unknown): string {
  const strings = (call as { strings?: readonly string[] }).strings ?? [];
  return strings.join(' ');
}

describe('consumer society-unit booking authorization', () => {
  it('requires verified ownership before an owner can book against a society unit', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      serviceOffering: { findFirst: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const availability = { lockAndAssertBookable: vi.fn() };
    const service = new ConsumerBookingsService(
      prisma as unknown as ConstructorParameters<typeof ConsumerBookingsService>[0],
      availability as unknown as ConstructorParameters<typeof ConsumerBookingsService>[1],
    );

    await expect(service.createBooking('11111111-1111-4111-8111-111111111111', {
      locationType: 'SOCIETY_UNIT',
      locationId: '22222222-2222-4222-8222-222222222222',
      offeringId: '33333333-3333-4333-8333-333333333333',
      scheduledFrom: new Date('2030-01-01T10:00:00Z'),
      scheduledUntil: new Date('2030-01-01T11:00:00Z'),
    })).rejects.toThrow('Service-ready society unit not found');

    expect(tx.serviceOffering.findFirst).not.toHaveBeenCalled();
    expect(availability.lockAndAssertBookable).not.toHaveBeenCalled();
    expect(sqlText(tx.$queryRaw.mock.calls[0][0])).toContain('ow."verified" = true');
  });
});
