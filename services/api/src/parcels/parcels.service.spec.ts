import { describe, expect, it, vi } from 'vitest';
import { NotificationRealtimeService } from '../notifications/notification-realtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { ParcelsService } from './parcels.service';

const societyId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const unitId = '33333333-3333-4333-8333-333333333333';
const recipientId = '44444444-4444-4444-8444-444444444444';
const parcelId = '55555555-5555-4555-8555-555555555555';

describe('ParcelsService', () => {
  it('rejects intake when recipient is not a current occupant', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]), $executeRaw: vi.fn() };
    const prisma = { $transaction: vi.fn((cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new ParcelsService(prisma as unknown as PrismaService);
    await expect(service.intake(societyId, actorId, { unitId, recipientUserId: recipientId })).rejects.toThrow('current occupant');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('creates parcel and evidence transactionally then notifies the assigned resident', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{ id: 'occupancy-1' }]).mockResolvedValueOnce([{ id: parcelId, status: 'RECEIVED' }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { $transaction: vi.fn((cb: (client: typeof tx) => unknown) => cb(tx)) };
    const realtime = { publishResident: vi.fn() };
    const service = new ParcelsService(prisma as unknown as PrismaService, realtime as unknown as NotificationRealtimeService);
    await expect(service.intake(societyId, actorId, { unitId, recipientUserId: recipientId, courierName: 'BlueDart' })).resolves.toMatchObject({ id: parcelId, status: 'RECEIVED' });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(realtime.publishResident).toHaveBeenCalledWith(expect.objectContaining({
      type: 'PARCEL_RECEIVED', societyId, userId: recipientId, unitId, parcelId,
    }));
  });

  it('allows only the assigned resident to confirm collection', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ id: parcelId, status: 'COLLECTED', collectedAt: new Date() }]), $executeRaw: vi.fn().mockResolvedValue(1) };
    const prisma = { $transaction: vi.fn((cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new ParcelsService(prisma as unknown as PrismaService);
    await expect(service.confirmCollection(societyId, recipientId, parcelId)).resolves.toMatchObject({ status: 'COLLECTED' });
    const sql = (tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(sql).toContain('"recipientUserId"');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('surfaces uncollected parcels as an overdue-aware desk queue with the canonical unit number field', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new ParcelsService(prisma as unknown as PrismaService);
    await service.listDesk(societyId);
    const query = prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    const sql = query.strings.join(' ');
    expect(sql).toContain("p.\"status\"='RECEIVED'");
    expect(sql).toContain('u."number" AS "unitNumber"');
    expect(sql).toContain("INTERVAL '");
    expect(sql).toContain("hours'");
    expect(query.values).toContain(24);
  });
});
