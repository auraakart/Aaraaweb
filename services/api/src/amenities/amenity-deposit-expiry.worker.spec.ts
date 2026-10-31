import { describe, expect, it, vi } from 'vitest';
import { AmenityDepositExpiryWorker } from './amenity-deposit-expiry.worker';
import { TENANT_CONTEXT_SETTING } from '../prisma/prisma.service';
const a = { id: 'booking-a', societyId: 'society-a', amenityId: 'amenity-a', startsAt: new Date(), endsAt: new Date() };
const b = { ...a, id: 'booking-b', societyId: 'society-b' };
function fixture() {
  const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };
  const denied = vi.fn(() => { throw new Error('Root query denied'); });
  const transaction = vi.fn(async (run: (client: typeof tx) => unknown) => run(tx));
  const promote = vi.fn().mockResolvedValue(undefined);
  const worker = new AmenityDepositExpiryWorker({ $transaction: transaction, $queryRaw: denied } as never, promote);
  return { tx, transaction, denied, promote, worker };
}
describe('Amenity unpaid-deposit expiry capability', () => {
  it.each([[0, 1], [500, 200], [3.9, 3], [NaN, 50], [Infinity, 50]])('bounds discovery limit %s to %s', async (input, expected) => {
    const f = fixture(); await expect(f.worker.run(input)).resolves.toMatchObject({ expired: 0, mutationPerformed: false });
    expect(f.tx.$queryRaw.mock.calls[0][0]).toMatchObject({ values: [expected] });
    expect(f.denied).not.toHaveBeenCalled(); expect(f.promote).not.toHaveBeenCalled();
  });
  it('sets each selected society before locking and promotes only successfully closed reservations in the same batch', async () => {
    const f = fixture(); f.tx.$queryRaw.mockResolvedValueOnce([a, b])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([a]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: a.id }])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([b]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: b.id }]);
    await expect(f.worker.run()).resolves.toMatchObject({ expired: 2, mutationPerformed: true });
    expect(f.transaction).toHaveBeenCalledTimes(1);
    for (const [index, booking] of [[1, a], [5, b]] as const) {
      expect(f.tx.$queryRaw.mock.calls[index][0]).toMatchObject({ values: [TENANT_CONTEXT_SETTING, booking.societyId], sql: expect.stringContaining('true') });
      expect(f.tx.$queryRaw.mock.calls[index + 1][0]).toMatchObject({ sql: expect.stringContaining('FOR UPDATE OF b SKIP LOCKED'), values: [booking.id, booking.societyId] });
      expect(f.promote).toHaveBeenCalledWith(f.tx, booking);
    }
    expect(f.denied).not.toHaveBeenCalled();
  });
  it('skips a captured, closed, foreign-parent or concurrently locked candidate after revalidation', async () => {
    const f = fixture(); f.tx.$queryRaw.mockResolvedValueOnce([a]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(f.worker.run()).resolves.toMatchObject({ expired: 0 });
    const query = f.tx.$queryRaw.mock.calls[2][0] as unknown as { sql: string };
    expect(query.sql).toContain('parent."societyId"=b."societyId"');
    expect(query.sql).toContain('"depositStatus"=\'PAYMENT_REQUIRED\'');
    expect(f.promote).not.toHaveBeenCalled();
  });
  it('does not promote when the conditional close loses a race', async () => {
    const f = fixture(); f.tx.$queryRaw.mockResolvedValueOnce([a]).mockResolvedValueOnce([]).mockResolvedValueOnce([a]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(f.worker.run()).resolves.toMatchObject({ expired: 0 }); expect(f.promote).not.toHaveBeenCalled();
  });
  it('propagates promotion failure through the transaction instead of partially committing a batch', async () => {
    const f = fixture(); f.tx.$queryRaw.mockResolvedValueOnce([a]).mockResolvedValueOnce([]).mockResolvedValueOnce([a]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: a.id }]);
    f.promote.mockRejectedValueOnce(new Error('Promotion denied'));
    await expect(f.worker.run()).rejects.toThrow('Promotion denied'); expect(f.transaction).toHaveBeenCalledTimes(1);
  });
});
