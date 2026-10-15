import { describe, expect, it, vi } from 'vitest';
import { ServiceQualityChecklistService } from './service-quality-checklist.service';

const userId = '11111111-1111-4111-8111-111111111111';
const providerId = '22222222-2222-4222-8222-222222222222';
const offeringId = '33333333-3333-4333-8333-333333333333';
const bookingId = '44444444-4444-4444-8444-444444444444';
const items = [{ id: 'inspect_wiring', label: 'Inspect wiring', required: true }];

function setup() {
  const tx = { $queryRaw: vi.fn(), $executeRaw: vi.fn().mockResolvedValue(1) };
  const prisma = {
    $queryRaw: vi.fn(), serviceOffering: { findFirst: vi.fn() },
    $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)),
  };
  const operators = { resolveProvider: vi.fn().mockResolvedValue({ providerId }) };
  const svc = new ServiceQualityChecklistService(
    prisma as unknown as ConstructorParameters<typeof ServiceQualityChecklistService>[0],
    operators as unknown as ConstructorParameters<typeof ServiceQualityChecklistService>[1],
  );
  return { tx, prisma, operators, svc };
}

describe('Services 4.0 quality-checklist templates', () => {
  it('rejects cross-provider template reads before querying the checklist', async () => {
    const { svc, prisma } = setup();
    prisma.serviceOffering.findFirst.mockResolvedValue(null);
    await expect(svc.getMyTemplate(userId, offeringId)).rejects.toThrow('Provider offering not found');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns an empty version-zero template when an owned offering has no checklist', async () => {
    const { svc, prisma } = setup();
    prisma.serviceOffering.findFirst.mockResolvedValue({ id: offeringId });
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(svc.getMyTemplate(userId, offeringId)).resolves.toEqual({
      offeringId, version: 0, items: [], updatedAt: null,
    });
  });

  it('creates the first version and an audit revision within the same transaction', async () => {
    const { svc, tx, operators } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: offeringId }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ offeringId, version: 1, items, updatedAt: new Date() }]);
    const result = await svc.replaceMyTemplate(userId, offeringId, {
      expectedVersion: 0, items: [{ id: ' inspect_wiring ', label: ' Inspect wiring ', required: true }],
    });
    expect(result.version).toBe(1);
    expect(operators.resolveProvider).toHaveBeenCalledWith(userId);
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    const sql = String(tx.$executeRaw.mock.calls[0][0].strings.join(' '));
    expect(sql).toContain('ServiceOfferingQualityChecklistRevision');
    expect(tx.$queryRaw.mock.calls[0][0].strings.join(' ')).toContain('FOR UPDATE');
  });

  it('rejects stale versions without changing the template or recording a revision', async () => {
    const { svc, tx } = setup();
    tx.$queryRaw.mockResolvedValueOnce([{ id: offeringId }]).mockResolvedValueOnce([{ version: 3 }]);
    await expect(svc.replaceMyTemplate(userId, offeringId, { expectedVersion: 2, items }))
      .rejects.toThrow('Checklist changed; reload');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('rejects duplicate checklist IDs without starting a transaction', async () => {
    const { svc, prisma } = setup();
    await expect(svc.replaceMyTemplate(userId, offeringId, {
      expectedVersion: 0, items: [...items, { ...items[0] }],
    })).rejects.toThrow('Invalid or duplicate checklist item');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not return another consumer\'s immutable checklist snapshot', async () => {
    const { svc, prisma } = setup();
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(svc.getConsumerBookingSnapshot(userId, bookingId)).rejects.toThrow('Booking not found');
    const sql = prisma.$queryRaw.mock.calls[0][0];
    expect(sql.strings.join(' ')).toContain('b."userId"');
    expect(sql.values).toEqual([bookingId, userId]);
  });

  it('returns a saved immutable booking checklist even if the live template later changes', async () => {
    const { svc, prisma } = setup();
    const snapshot = { bookingId, offeringId, templateVersion: 1, items, capturedAt: new Date(), captured: true };
    prisma.$queryRaw.mockResolvedValue([snapshot]);
    await expect(svc.getConsumerBookingSnapshot(userId, bookingId)).resolves.toEqual({
      ...snapshot, immutable: true,
    });
    const query = prisma.$queryRaw.mock.calls[0][0];
    expect(query.strings.join(' ')).toContain('ConsumerServiceQualityChecklistSnapshot');
    expect(query.strings.join(' ')).not.toContain('ServiceOfferingQualityChecklist" t');
  });

  it('does not misrepresent legacy bookings as immutable checklist commitments', async () => {
    const { svc, prisma } = setup();
    prisma.$queryRaw.mockResolvedValue([{
      bookingId, offeringId, templateVersion: 0, items: [], capturedAt: null, captured: false,
    }]);
    await expect(svc.getConsumerBookingSnapshot(userId, bookingId)).resolves.toEqual({
      bookingId, offeringId, templateVersion: 0, items: [], capturedAt: null, captured: false, immutable: false,
    });
  });

  it('does not reveal another consumer\'s booking checklist', async () => {
    const { svc, prisma } = setup();
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(svc.getConsumerBookingPreview(userId, bookingId)).rejects.toThrow('Booking not found');
  });

  it('labels the owner-only booking view as a live preview, not a booking-time guarantee', async () => {
    const { svc, prisma } = setup();
    prisma.$queryRaw.mockResolvedValue([{ bookingId, offeringId, templateVersion: 2, items }]);
    await expect(svc.getConsumerBookingPreview(userId, bookingId)).resolves.toEqual({
      bookingId, offeringId, templateVersion: 2, items, previewOnly: true,
    });
    const sql = prisma.$queryRaw.mock.calls[0][0];
    expect(sql.strings.join(' ')).toContain('b."userId"');
    expect(sql.values).toEqual([bookingId, userId]);
  });
});
