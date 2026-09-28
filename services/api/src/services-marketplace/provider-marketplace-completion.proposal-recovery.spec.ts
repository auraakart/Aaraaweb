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
