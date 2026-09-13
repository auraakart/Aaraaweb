import { describe, expect, it, vi } from 'vitest';
import { NotificationRealtimeService } from '../notifications/notification-realtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmergencyBroadcastService } from './emergency-broadcast.service';

describe('EmergencyBroadcastService', () => {
  it('snapshots active non-vendor society members and publishes to each recipient', async () => {
    const broadcast = {
      id: 'broadcast-1', societyId: 'society-1', incidentId: null,
      title: 'Fire alert', body: 'Evacuate using the east staircase', severity: 'CRITICAL',
      status: 'PUBLISHED', createdByUserId: 'admin-1', publishedAt: new Date('2026-09-13T18:10:00Z'), createdAt: new Date(),
    };
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([broadcast])
        .mockResolvedValueOnce([{ userId: 'resident-1' }, { userId: 'guard-1' }]),
      $executeRaw: vi.fn().mockResolvedValue(2),
    };
    const prisma = { $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    const realtime = { publishResident: vi.fn() };
    const service = new EmergencyBroadcastService(
      prisma as unknown as PrismaService,
      realtime as unknown as NotificationRealtimeService,
    );

    const result = await service.publish('society-1', 'admin-1', {
      title: 'Fire alert', body: 'Evacuate using the east staircase', severity: 'CRITICAL',
    });

    const recipientInsert = tx.$executeRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    const sql = recipientInsert.strings.join(' ');
    expect(sql).toContain('"SocietyMembership"');
    expect(sql).toContain('sm."active" = true');
    expect(sql).toContain('sm."role" <>');
    expect(recipientInsert.values).toContain('society-1');
    expect(realtime.publishResident).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ id: 'broadcast-1', recipientCount: 2, acknowledgedCount: 0 });
  });

  it('acknowledges only the authenticated recipient inside the current society', async () => {
    const acknowledgedAt = new Date('2026-09-13T18:11:00Z');
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ id: 'recipient-1', acknowledgedAt }]) };
    const service = new EmergencyBroadcastService(
      prisma as unknown as PrismaService,
      { publishResident: vi.fn() } as unknown as NotificationRealtimeService,
    );

    await service.acknowledge('society-1', 'resident-1', 'broadcast-1');

    const query = prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(query.strings.join(' ')).toContain('ebr."userId"');
    expect(query.strings.join(' ')).toContain('ebr."societyId"');
    expect(query.values).toContain('resident-1');
    expect(query.values).toContain('society-1');
    expect(query.values).toContain('broadcast-1');
  });

  it('does not leak or acknowledge a broadcast not snapshotted for the user', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new EmergencyBroadcastService(
      prisma as unknown as PrismaService,
      { publishResident: vi.fn() } as unknown as NotificationRealtimeService,
    );

    await expect(service.acknowledge('society-1', 'resident-2', 'broadcast-1')).rejects.toThrow(
      'Emergency broadcast not found for the authenticated recipient',
    );
  });

  it('requires a linked incident to be open and inside the current society', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new EmergencyBroadcastService(
      prisma as unknown as PrismaService,
      { publishResident: vi.fn() } as unknown as NotificationRealtimeService,
    );

    await expect(service.publish('society-1', 'admin-1', {
      incidentId: 'incident-elsewhere', title: 'Security alert', body: 'Remain indoors',
    })).rejects.toThrow('Emergency broadcast incident must be active in the current society');
  });
});
