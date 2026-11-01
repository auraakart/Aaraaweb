import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { assessAmenityBlackout } from './amenity-blackout-assessment';
import { AmenityPolicyEngine } from './amenity-policy.engine';

const input = { startsAt: '2099-01-01T10:00:00Z', endsAt: '2099-01-01T12:00:00Z', reason: ' Maintenance ' };
function fixture(schedule: unknown = {}) {
  const query = vi.fn().mockResolvedValueOnce([{ schedule }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  return { query, tx: { $queryRaw: query } as unknown as Prisma.TransactionClient };
}
describe('Extracted amenity blackout assessment', () => {
  it.each([
    { startsAt: 'invalid' }, { endsAt: 'invalid' },
    { endsAt: input.startsAt }, { startsAt: '2099-01-02T10:00:00Z' },
    { startsAt: '2000-01-01', endsAt: '2000-01-02' }, { reason: ' ' },
  ])('rejects invalid input before querying: %j', async change => {
    const f = fixture(); await expect(assessAmenityBlackout(f.tx, new AmenityPolicyEngine(), 'society-a', 'amenity-a', { ...input, ...change })).rejects.toThrow();
    expect(f.query).not.toHaveBeenCalled();
  });
  it('does not resolve a missing amenity or an existing overlapping blackout', async () => {
    const missing = fixture(); missing.query.mockReset().mockResolvedValue([]);
    await expect(assessAmenityBlackout(missing.tx, new AmenityPolicyEngine(), 'society-a', 'amenity-a', input)).rejects.toThrow('Amenity not found');
    const occupied = fixture({ blackouts: [{ start: input.startsAt, end: input.endsAt }] });
    await expect(assessAmenityBlackout(occupied.tx, new AmenityPolicyEngine(), 'society-a', 'amenity-a', input)).rejects.toThrow('overlapping configured blackout');
  });
  it.each([[[], [], true], [[{ id: 'booking' }], [], false], [[], [{ id: 'waiting' }], false]] as const)('reports impact without mutation', async (bookings, waitlist, canApply) => {
    const f = fixture(); f.query.mockReset().mockResolvedValueOnce([{ schedule: {} }]).mockResolvedValueOnce(bookings).mockResolvedValueOnce(waitlist);
    const result = await assessAmenityBlackout(f.tx, new AmenityPolicyEngine(), 'society-a', 'amenity-a', input);
    expect(result).toMatchObject({ canApply, mutationPerformed: false, automaticCancellation: false, blackout: { reason: 'Maintenance', kind: 'MAINTENANCE' } });
    expect(f.query.mock.calls[0][1]).toBe('amenity-a'); expect(f.query.mock.calls[0][2]).toBe('society-a');
  });
});
