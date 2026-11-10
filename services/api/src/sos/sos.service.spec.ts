import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { SosService } from './sos.service';

describe('SosService relationship authorization', () => {
  it('rejects an SOS unit without a current occupancy inside tenant context', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const prisma = { withTenantContext: vi.fn(async (_society: string, operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) };
    const service = new SosService(prisma as unknown as PrismaService);
    await expect(service.trigger('society-1', 'user-1', { unitId: 'unit-1' })).rejects.toThrow(
      'Unit is not assigned to the authenticated resident',
    );
    const query = tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[] };
    const sql = query.strings.join(' ');
    expect(sql).toContain('"UnitOccupancy"');
    expect(sql).toContain('"effectiveTo" IS NULL');
    expect(sql).not.toContain('"UnitResident"');
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
  });
  it('persists explicit emergency category and severity after current-occupancy validation in one tenant transaction', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: 'occupancy-1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'incident-1' }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { withTenantContext: vi.fn(async (_society: string, operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) };
    const service = new SosService(prisma as unknown as PrismaService);

    await service.trigger('society-1', 'user-1', {
      unitId: 'unit-1', category: 'MEDICAL', severity: 'CRITICAL', message: 'Need ambulance support',
    });

    const occupancy = tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[] };
    expect(occupancy.strings.join(' ')).toContain('"UnitOccupancy"');
    const insert = tx.$queryRaw.mock.calls[2][0] as { strings: readonly string[]; values: unknown[] };
    expect(insert.strings.join(' ')).toContain('"category", "severity"');
    expect(insert.values).toContain('MEDICAL');
    expect(insert.values).toContain('CRITICAL');
    const event = tx.$executeRaw.mock.calls[1][0] as { values: unknown[] };
    expect(event.values).toContain('category=MEDICAL;severity=CRITICAL');
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
  });
  it('uses backward-compatible OTHER/HIGH defaults when older clients omit classification', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: 'occupancy-1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'incident-1' }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { withTenantContext: vi.fn(async (_society: string, operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) };
    const service = new SosService(prisma as unknown as PrismaService);
    await service.trigger('society-1', 'user-1', { unitId: 'unit-1' });
    const insert = tx.$queryRaw.mock.calls[2][0] as { values: unknown[] };
    expect(insert.values).toContain('OTHER');
    expect(insert.values).toContain('HIGH');
  });
  it('serializes the resident/unit trigger scope and reuses an existing active incident', async () => {
    const existing = { id: 'incident-existing', unitId: 'unit-1', residentUserId: 'user-1', status: 'ACTIVE' };
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: 'occupancy-1' }])
        .mockResolvedValueOnce([existing]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { withTenantContext: vi.fn(async (_society: string, operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) };
    const service = new SosService(prisma as unknown as PrismaService);
    const result = await service.trigger('society-1', 'user-1', { unitId: 'unit-1' });
    expect(result).toEqual(existing);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const lock = tx.$executeRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(lock.strings.join(' ')).toContain('pg_advisory_xact_lock');
    expect(lock.values).toContain('sos:society-1:unit-1:user-1');
  });
  it('notifies only the configured active SOS responder after a new incident commits', async () => {
    const incident = {
      id: 'incident-new', societyId: 'society-1', unitId: 'unit-1', residentUserId: 'resident-1',
      status: 'ACTIVE', category: 'MEDICAL', severity: 'CRITICAL', message: null, createdAt: new Date('2026-11-10T10:00:00.000Z'),
    };
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: 'occupancy-1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([incident]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { withTenantContext: vi.fn(async (_society: string, operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) };
    const notifications = { publishResident: vi.fn() };
    const routing = {
      listPolicies: vi.fn().mockResolvedValue([{ severity: 'CRITICAL', responderUserId: 'responder-1', active: true }]),
      listCandidates: vi.fn().mockResolvedValue([
        { userId: 'responder-1', name: 'Responder One', roles: ['SECURITY_SUPERVISOR'] },
        { userId: 'responder-2', name: 'Responder Two', roles: ['SOCIETY_ADMIN'] },
      ]),
    };
    const service = new SosService(prisma as unknown as PrismaService, notifications as never, routing as never);

    await expect(service.trigger('society-1', 'resident-1', { unitId: 'unit-1', category: 'MEDICAL', severity: 'CRITICAL' }))
      .resolves.toEqual(incident);

    expect(routing.listPolicies).toHaveBeenCalledWith('society-1');
    expect(routing.listCandidates).toHaveBeenCalledWith('society-1');
    expect(notifications.publishResident).toHaveBeenCalledTimes(1);
    expect(notifications.publishResident).toHaveBeenCalledWith(expect.objectContaining({
      type: 'SOS_INCIDENT_ALERT',
      societyId: 'society-1',
      userId: 'responder-1',
      incidentId: 'incident-new',
      severity: 'CRITICAL',
      category: 'MEDICAL',
    }));
  });

  it('does not notify responders when a trigger reuses an existing active incident', async () => {
    const existing = { id: 'incident-existing', unitId: 'unit-1', residentUserId: 'resident-1', status: 'ACTIVE', societyId: 'society-1' };
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: 'occupancy-1' }])
        .mockResolvedValueOnce([existing]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { withTenantContext: vi.fn(async (_society: string, operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) };
    const notifications = { publishResident: vi.fn() };
    const routing = { listPolicies: vi.fn(), listCandidates: vi.fn() };
    const service = new SosService(prisma as unknown as PrismaService, notifications as never, routing as never);

    await service.trigger('society-1', 'resident-1', { unitId: 'unit-1' });

    expect(notifications.publishResident).not.toHaveBeenCalled();
    expect(routing.listPolicies).not.toHaveBeenCalled();
    expect(routing.listCandidates).not.toHaveBeenCalled();
  });

  it('records escalation as an append-only incident event without changing incident status', async () => {
    const escalatedAt = new Date('2026-09-13T17:45:00Z');
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'incident-1', status: 'ACKNOWLEDGED', societyId: 'society-1' }])
        .mockResolvedValueOnce([{ occurredAt: escalatedAt }]),
    };
    const prisma = { withTenantContext: vi.fn(async (_society: string, operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) };
    const service = new SosService(prisma as unknown as PrismaService);

    const result = await service.escalate('society-1', 'responder-1', 'incident-1', 'Escalate to control room');

    const insert = tx.$queryRaw.mock.calls[1][0] as { strings: readonly string[]; values: unknown[] };
    expect(insert.strings.join(' ')).toContain("'ESCALATED'");
    expect(insert.values).toContain('ACKNOWLEDGED');
    expect(insert.values).toContain('Escalate to control room');
    expect(result).toMatchObject({ id: 'incident-1', status: 'ACKNOWLEDGED', escalatedAt });
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
  });

  it('does not allow a resolved incident to be escalated', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ id: 'incident-1', status: 'RESOLVED', societyId: 'society-1' }]) };
    const prisma = { withTenantContext: vi.fn(async (_society: string, operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) };
    const service = new SosService(prisma as unknown as PrismaService);

    await expect(service.escalate('society-1', 'responder-1', 'incident-1')).rejects.toThrow(
      'Only active or acknowledged SOS incidents can be escalated',
    );
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('prioritizes escalated active incidents in the responder queue through tenant context', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const prisma = { withTenantContext: vi.fn(async (_society: string, operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) };
    const service = new SosService(prisma as unknown as PrismaService);
    await service.listManage('society-1');
    const query = tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[] };
    const sql = query.strings.join(' ');
    expect(sql).toContain("se.\"action\" = 'ESCALATED'");
    expect(sql).toContain('"escalatedAt" IS NOT NULL');
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
  });
  it('derives active emergency contacts from the incident household within the same society', async () => {
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'incident-1', unitId: 'unit-1', societyId: 'society-1', status: 'ACTIVE' }])
        .mockResolvedValueOnce([
          { contactId: 'contact-1', name: 'Parent', phone: '9000000000', relation: 'Father', priority: 1 },
        ]),
    };
    const prisma = { withTenantContext: vi.fn(async (_society: string, operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) };
    const service = new SosService(prisma as unknown as PrismaService);

    const result = await service.escalationTargets('society-1', 'incident-1');

    expect(result).toHaveLength(1);
    const query = tx.$queryRaw.mock.calls[1][0] as { strings: readonly string[]; values: unknown[] };
    const sql = query.strings.join(' ');
    expect(sql).toContain('"Household"');
    expect(sql).toContain('"EmergencyContact"');
    expect(sql).toContain('ec."active" = true');
    expect(sql).toContain('ORDER BY ec."priority" ASC');
    expect(query.values).toContain('society-1');
    expect(query.values).toContain('unit-1');
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
  });

  it('does not expose emergency contacts for an incident outside the current society', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const prisma = { withTenantContext: vi.fn(async (_society: string, operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) };
    const service = new SosService(prisma as unknown as PrismaService);

    await expect(service.escalationTargets('society-1', 'incident-elsewhere')).rejects.toThrow('SOS incident not found');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
  });
  it('lists resident SOS incidents only through the selected society transaction', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const prisma = { withTenantContext: vi.fn(async (_society: string, operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) };
    const service = new SosService(prisma as unknown as PrismaService);
    await expect(service.listMine('society-1', 'resident-1')).resolves.toEqual([]);
    const query = tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(query.strings.join(' ')).toContain('"residentUserId"');
    expect(query.values).toContain('society-1');
    expect(query.values).toContain('resident-1');
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
  });

});
