import { describe, expect, it, vi } from 'vitest';
import { ProviderMarketplaceCompletionService } from './provider-marketplace-completion.service';

function sqlText(call: unknown): string {
  return ((call as { strings?: readonly string[] }).strings ?? []).join('?');
}
function sqlValues(call: unknown): unknown[] {
  return (call as { values?: unknown[] }).values ?? [];
}
function setup() {
  const tx = {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const availability = { lockAndAssertBookable: vi.fn() };
  const service = new ProviderMarketplaceCompletionService(
    prisma as never,
    {} as never,
    availability as never,
  );
  return { tx, prisma, availability, service };
}

describe('ProviderMarketplaceCompletionService resident proposal recovery', () => {
  it('rejects a provider proposal with audited resident reason', async () => {
    const { tx, availability, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{
        id: 'booking-1', userId: 'user-1', providerId: 'provider-1', offeringId: 'offering-1',
        status: 'REQUESTED', addressSnapshot: { postalCode: '560038' },
      }])
      .mockResolvedValueOnce([{
        id: 'proposal-1', bookingId: 'booking-1', providerId: 'provider-1',
        proposedFrom: new Date('2030-01-01T10:00:00Z'), proposedUntil: new Date('2030-01-01T11:00:00Z'),
        note: null, status: 'PENDING', createdByUserId: 'provider-user-1',
        respondedByUserId: null, respondedAt: null, createdAt: new Date('2026-09-27T00:00:00Z'),
      }])
      .mockResolvedValueOnce([{ id: 'proposal-1', status: 'REJECTED' }]);

    const result = await service.respondToProposal(
      'user-1', 'booking-1', 'proposal-1', 'REJECT', '  Schedule conflicts with school pickup  ',
    );

    expect(result.status).toBe('REJECTED');
    expect(availability.lockAndAssertBookable).not.toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const event = tx.$executeRaw.mock.calls[0][0];
    expect(sqlText(event)).toContain('CUSTOMER_REJECTED_PROVIDER_PROPOSAL');
    expect(sqlText(event)).toContain('"note"');
    expect(sqlValues(event)).toContain('Schedule conflicts with school pickup');
  });

  it('requires a meaningful reason before starting the rejection transaction', async () => {
    const { prisma, service } = setup();

    await expect(service.respondToProposal(
      'user-1', 'booking-1', 'proposal-1', 'REJECT', ' ',
    )).rejects.toThrow('Proposal rejection reason must be between 3 and 500 characters');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('V4.90.18.1 provider proposal races and dispute continuity', () => {
  const operator = { resolveProvider: vi.fn().mockResolvedValue({ providerId: 'provider-1' }) };

  it('locks the booking before creating a provider time proposal', async () => {
    const tx = { $queryRaw: vi.fn()
      .mockResolvedValueOnce([{ id: 'booking-1', status: 'REQUESTED' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'proposal-1', status: 'PENDING' }]) };
    const prisma = { $transaction: vi.fn(async (cb: (value: typeof tx) => unknown) => cb(tx)) };
    const svc = new ProviderMarketplaceCompletionService(prisma as never, operator as never, {} as never);
    const proposal = await svc.proposeBookingTime('provider-user','booking-1',
      new Date('2030-01-01T09:00:00Z'),new Date('2030-01-01T10:00:00Z'));
    expect(proposal).toMatchObject({ id: 'proposal-1' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(sqlText(tx.$queryRaw.mock.calls[0][0])).toContain('FOR UPDATE');
    expect(sqlText(tx.$queryRaw.mock.calls[2][0])).toContain('INSERT INTO "ProviderBookingProposal"');
  });

  it('does not propose a different time for a booking cancelled concurrently', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ id: 'booking-1', status: 'CANCELLED' }]) };
    const prisma = { $transaction: vi.fn(async (cb: (value: typeof tx) => unknown) => cb(tx)) };
    const svc = new ProviderMarketplaceCompletionService(prisma as never, operator as never, {} as never);
    await expect(svc.proposeBookingTime('provider-user','booking-1',
      new Date('2030-01-01T09:00:00Z'),new Date('2030-01-01T10:00:00Z')))
      .rejects.toThrow('Only requested bookings');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('fails closed on an unavailable provider booking', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const prisma = { $transaction: vi.fn(async (cb: (value: typeof tx) => unknown) => cb(tx)) };
    const svc = new ProviderMarketplaceCompletionService(prisma as never, operator as never, {} as never);
    await expect(svc.proposeBookingTime('provider-user','unknown',
      new Date('2030-01-01T09:00:00Z'),new Date('2030-01-01T10:00:00Z')))
      .rejects.toThrow('Provider booking not found');
  });

  it('requires consumer ownership before returning dispute notes and resolution', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValueOnce([]) };
    const svc = new ProviderMarketplaceCompletionService(prisma as never, operator as never, {} as never);
    await expect(svc.listConsumerDisputes('user-1','other-booking'))
      .rejects.toThrow('Booking not found');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns only scoped dispute history after validating booking ownership', async () => {
    const prisma = { $queryRaw: vi.fn()
      .mockResolvedValueOnce([{ id: 'booking-1', providerId: 'provider-1', status: 'COMPLETED' }])
      .mockResolvedValueOnce([{ id: 'dispute-1', status: 'RESOLVED', resolutionNote: 'Repair completed' }]) };
    const svc = new ProviderMarketplaceCompletionService(prisma as never, operator as never, {} as never);
    expect(await svc.listConsumerDisputes('user-1','booking-1'))
      .toMatchObject([{ id: 'dispute-1', resolutionNote: 'Repair completed' }]);
    const query = prisma.$queryRaw.mock.calls[1][0];
    expect(sqlText(query)).toContain('"userId"');
    expect(sqlText(query)).toContain('"bookingId"');
    expect(sqlValues(query)).toContain('user-1');
  });
});
