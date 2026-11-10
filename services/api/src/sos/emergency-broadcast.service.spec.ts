import { describe, expect, it, vi } from 'vitest';
import { NotificationRealtimeService } from '../notifications/notification-realtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmergencyBroadcastService } from './emergency-broadcast.service';

function setup() {
  const tx = { $queryRaw: vi.fn(), $executeRaw: vi.fn() };
  const prisma = {
    withTenantContext: vi.fn(async (_societyId: string, operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
  };
  const realtime = { publishResident: vi.fn() };
  const service = new EmergencyBroadcastService(
    prisma as unknown as PrismaService,
    realtime as unknown as NotificationRealtimeService,
  );
  return { service, prisma, tx, realtime };
}

describe('EmergencyBroadcastService', () => {
  it('snapshots active non-vendor society members and publishes to each recipient in tenant context', async () => {
    const broadcast = {
      id: 'broadcast-1', societyId: 'society-1', incidentId: null,
      title: 'Fire alert', body: 'Evacuate using the east staircase', severity: 'CRITICAL',
      status: 'PUBLISHED', createdByUserId: 'admin-1', publishedAt: new Date('2026-09-13T18:10:00Z'), createdAt: new Date(),
    };
    const { service, prisma, tx, realtime } = setup();
    tx.$queryRaw.mockResolvedValueOnce([broadcast]).mockResolvedValueOnce([{ userId: 'resident-1' }, { userId: 'guard-1' }]);
    tx.$executeRaw.mockResolvedValue(2);

    const result = await service.publish('society-1', 'admin-1', {
      title: 'Fire alert', body: 'Evacuate using the east staircase', severity: 'CRITICAL',
    });

    const recipientInsert = tx.$executeRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    const sql = recipientInsert.strings.join(' ');
    expect(sql).toContain('"SocietyMembership"');
    expect(sql).toContain('sm."active" = true');
    expect(sql).toContain('sm."role" <>');
    expect(recipientInsert.values).toContain('society-1');
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
    expect(realtime.publishResident).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ id: 'broadcast-1', recipientCount: 2, acknowledgedCount: 0 });
  });

  it('validates the linked incident and creates the broadcast in the same tenant transaction', async () => {
    const broadcast = {
      id: 'broadcast-2', societyId: 'society-1', incidentId: 'incident-1',
      title: 'Security alert', body: 'Remain indoors', severity: 'HIGH',
      status: 'PUBLISHED', createdByUserId: 'admin-1', publishedAt: new Date('2026-09-13T18:10:00Z'), createdAt: new Date(),
    };
    const { service, prisma, tx } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: 'incident-1' }])
      .mockResolvedValueOnce([broadcast])
      .mockResolvedValueOnce([{ userId: 'resident-1' }]);

    await service.publish('society-1', 'admin-1', {
      incidentId: 'incident-1', title: 'Security alert', body: 'Remain indoors',
    });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(1);
    const incidentQuery = tx.$queryRaw.mock.calls[0][0] as { values: unknown[] };
    const broadcastInsert = tx.$queryRaw.mock.calls[1][0] as { values: unknown[] };
    expect(incidentQuery.values).toContain('society-1');
    expect(incidentQuery.values).toContain('incident-1');
    expect(broadcastInsert.values).toContain('incident-1');
  });

  it('rejects a linked incident outside the current society before creating a broadcast', async () => {
    const { service, prisma, tx } = setup();
    tx.$queryRaw.mockResolvedValueOnce([]);

    await expect(service.publish('society-1', 'admin-1', {
      incidentId: 'incident-elsewhere', title: 'Security alert', body: 'Remain indoors',
    })).rejects.toThrow('Emergency broadcast incident must be active in the current society');

    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('lists resident broadcasts inside the selected tenant transaction', async () => {
    const { service, prisma, tx } = setup();
    tx.$queryRaw.mockResolvedValueOnce([]);

    await service.listMine('society-1', 'resident-1');

    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
    const query = tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(query.strings.join(' ')).toContain('ebr."userId"');
    expect(query.strings.join(' ')).toContain('eb."societyId" = ebr."societyId"');
    expect(query.values).toContain('resident-1');
    expect(query.values).toContain('society-1');
  });

  it('lists management broadcast totals inside the selected tenant transaction', async () => {
    const { service, prisma, tx } = setup();
    tx.$queryRaw.mockResolvedValueOnce([]);

    await service.listManage('society-1');

    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
    const query = tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(query.strings.join(' ')).toContain('"acknowledgedCount"');
    expect(query.values).toContain('society-1');
  });

  it('acknowledges only the authenticated recipient inside the current society transaction', async () => {
    const acknowledgedAt = new Date('2026-09-13T18:11:00Z');
    const { service, prisma, tx } = setup();
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'recipient-1', acknowledgedAt }]);

    await service.acknowledge('society-1', 'resident-1', 'broadcast-1');

    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
    const query = tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(query.strings.join(' ')).toContain('ebr."userId"');
    expect(query.strings.join(' ')).toContain('ebr."societyId"');
    expect(query.values).toContain('resident-1');
    expect(query.values).toContain('society-1');
    expect(query.values).toContain('broadcast-1');
  });

  it('does not acknowledge a broadcast not snapshotted for the user', async () => {
    const { service, prisma, tx } = setup();
    tx.$queryRaw.mockResolvedValueOnce([]);

    await expect(service.acknowledge('society-1', 'resident-2', 'broadcast-1')).rejects.toThrow(
      'Emergency broadcast not found for the authenticated recipient',
    );
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
  });
});
