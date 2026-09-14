import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { ParcelsService } from './parcels.service';

const societyId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const unitId = '33333333-3333-4333-8333-333333333333';
const parcelId = '44444444-4444-4444-8444-444444444444';

describe('ParcelsService', () => {
  it('snapshots current occupants and does not fall back to owners when occupants exist', async () => {
    const parcel = { id: parcelId, societyId, unitId, carrier: 'Courier', trackingReference: null, recipientName: null, packageType: 'PACKAGE', status: 'RECEIVED', notes: null, receivedAt: new Date() };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{ id: unitId }]).mockResolvedValueOnce([parcel]),
      $executeRaw: vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1),
    };
    const prisma = {
      $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)),
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    const service = new ParcelsService(prisma as unknown as PrismaService);

    await service.receive(societyId, actorId, { unitId, carrier: 'Courier' });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    const recipientSql = (tx.$executeRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(recipientSql).toContain('"UnitOccupancy"');
    expect(recipientSql).not.toContain('"UnitOwnership"');
  });

  it('falls back to verified owners when there is no current occupant', async () => {
    const parcel = { id: parcelId, societyId, unitId, carrier: null, trackingReference: null, recipientName: null, packageType: 'PACKAGE', status: 'RECEIVED', notes: null, receivedAt: new Date() };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{ id: unitId }]).mockResolvedValueOnce([parcel]),
      $executeRaw: vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1).mockResolvedValueOnce(1),
    };
    const prisma = {
      $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)),
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    const service = new ParcelsService(prisma as unknown as PrismaService);

    await service.receive(societyId, actorId, { unitId });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(3);
    const ownerSql = (tx.$executeRaw.mock.calls[1][0] as { strings: readonly string[] }).strings.join(' ');
    expect(ownerSql).toContain('"UnitOwnership"');
    expect(ownerSql).toContain('"verified"=true');
  });

  it('rejects collection by a user outside the parcel recipient snapshot', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]), $executeRaw: vi.fn() };
    const prisma = { $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)) };
    const service = new ParcelsService(prisma as unknown as PrismaService);

    await expect(service.collect(societyId, actorId, parcelId, '55555555-5555-4555-8555-555555555555'))
      .rejects.toThrow('Collector is not an authorized parcel recipient');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('scopes resident parcel history through the recipient snapshot', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new ParcelsService(prisma as unknown as PrismaService);
    await service.listMine(societyId, actorId);
    const sql = (prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] }).strings.join(' ');
    expect(sql).toContain('"ParcelRecipient"');
    expect(sql).toContain('"ParcelRecord"');
  });
});
