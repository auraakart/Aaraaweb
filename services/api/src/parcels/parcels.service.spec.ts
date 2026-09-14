import { BadRequestException } from '@nestjs/common';
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

  it('issues pickup codes only against the assigned resident parcel and stores a digest rather than plaintext', async () => {
    const expiresAt = new Date(Date.now() + 600_000);
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: parcelId, pickupCodeExpiresAt: expiresAt }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const service = new ParcelsService(prisma as unknown as PrismaService);
    const result = await service.issuePickupCode(societyId, recipientId, parcelId);
    expect(result.code).toMatch(/^\d{6}$/);
    const query = prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(query.strings.join(' ')).toContain('"pickupCodeHash"');
    expect(query.strings.join(' ')).toContain('"recipientUserId"');
    expect(query.strings.join(' ')).toContain('make_interval(mins =>');
    expect(query.values).not.toContain(result.code);
  });

  it('commits failed pickup attempts before returning an invalid-code error', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{
        id: parcelId,
        recipientUserId: recipientId,
        status: 'RECEIVED',
        pickupCodeSalt: 'salt',
        pickupCodeHash: 'not-the-presented-code',
        pickupCodeExpiresAt: new Date(Date.now() + 600_000),
        pickupCodeAttempts: 0,
        pickupCodeLockedAt: null,
      }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { $transaction: vi.fn(async (cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new ParcelsService(prisma as unknown as PrismaService);
    await expect(service.collectWithPickupCode(societyId, actorId, parcelId, '123456')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    const updateSql = (tx.$executeRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(updateSql).toContain('"pickupCodeAttempts"');
  });

  it('surfaces uncollected parcels as an overdue-aware desk queue with the canonical unit number field', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new ParcelsService(prisma as unknown as PrismaService);
    await service.listDesk(societyId);
    const query = prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    const sql = query.strings.join(' ');
    expect(sql).toContain("p.\"status\"='RECEIVED'");
    expect(sql).toContain('u."number" AS "unitNumber"');
    expect(sql).toContain('make_interval(hours =>');
    expect(query.values).toContain(24);
  });
});
