import { describe, expect, it, vi } from 'vitest';
import { AmenitiesService } from './amenities.service';

const society = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const amenity = '33333333-3333-4333-8333-333333333333';
const unit = '44444444-4444-4444-8444-444444444444';
const window = { startsAt: '2099-01-01T10:00:00.000Z', endsAt: '2099-01-01T11:00:00.000Z' };
const update = { name: 'Pool', feePaise: 0, requiresApproval: false, slotMinutes: 60, maxConcurrentBookings: 1, active: true };
function fixture() {
  const tx = { $queryRaw: vi.fn().mockResolvedValue([]), $executeRaw: vi.fn().mockResolvedValue(1) };
  const denied = vi.fn(async () => { throw new Error('Unscoped database access'); });
  const prisma = { $queryRaw: denied, $executeRaw: denied, $transaction: denied,
    withTenantContext: vi.fn((_society: string, run: (client: typeof tx) => unknown) => run(tx)) };
  return { tx, denied, prisma, service: new AmenitiesService(prisma as never) };
}
describe('Amenities transaction client boundaries', () => {
  const calls: Array<[string, (s: AmenitiesService) => Promise<unknown>]> = [
    ['available', s => s.listAvailable(society)], ['resident bookings', s => s.listMine(society, actor, unit)],
    ['create booking', s => s.createBooking(society, actor, amenity, { unitId: unit, ...window })],
    ['resident waitlist', s => s.listWaitlistMine(society, actor, unit)],
    ['join waitlist', s => s.joinWaitlist(society, actor, amenity, { unitId: unit, ...window })],
    ['cancel waitlist', s => s.cancelWaitlistMine(society, actor, amenity)],
    ['cancel booking', s => s.cancelMine(society, actor, amenity)],
    ['revoke', s => s.revoke(society, actor, amenity, 'Maintenance')],
    ['check in', s => s.checkIn(society, actor, amenity)], ['complete', s => s.complete(society, actor, amenity)],
    ['no show', s => s.markNoShow(society, actor, amenity)],
    ['blackout preview', s => s.previewBlackout(society, amenity, { ...window, reason: 'Maintenance' })],
    ['blackout apply', s => s.applyBlackout(society, amenity, { ...window, reason: 'Maintenance' })],
    ['blackout remove', s => s.removeBlackout(society, amenity, window)],
    ['hours preview', s => s.previewOperatingHours(society, amenity, null)],
    ['hours apply', s => s.applyOperatingHours(society, amenity, null)],
    ['manage amenities', s => s.listManage(society)],
    ['create amenity', s => s.createAmenity(society, { ...update, code: 'POOL' })],
    ['update amenity', s => s.updateAmenity(society, amenity, update)],
    ['manage bookings', s => s.listBookingsManage(society)],
    ['approve', s => s.approve(society, actor, amenity)], ['reject', s => s.reject(society, actor, amenity)],
    ['analytics', s => s.analytics(society)],
  ];
  it.each(calls)('uses only the selected client for %s', async (_label, call) => {
    const f = fixture(); await call(f.service).catch(() => undefined);
    expect(f.prisma.withTenantContext).toHaveBeenCalledExactlyOnceWith(society, expect.any(Function));
    expect(f.denied).not.toHaveBeenCalled();
  });
  it('checks current authority and unit/building parents on the client that reads resident bookings', async () => {
    const f = fixture(); f.tx.$queryRaw.mockResolvedValueOnce([{ allowed: true }]).mockResolvedValueOnce([{ id: amenity }]);
    await expect(f.service.listMine(society, actor, unit)).resolves.toEqual([{ id: amenity }]);
    const query = f.tx.$queryRaw.mock.calls[0][0] as readonly string[];
    expect(query.join(' ')).toContain('parent."societyId"=u."societyId"');
    expect(f.prisma.withTenantContext).toHaveBeenCalledTimes(1); expect(f.denied).not.toHaveBeenCalled();
  });
});
