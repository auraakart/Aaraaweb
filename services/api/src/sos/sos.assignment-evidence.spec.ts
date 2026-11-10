import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { SosService } from './sos.service';

function setup(results: unknown[]) {
  const tx = { $queryRaw: vi.fn(), $executeRaw: vi.fn() };
  for (const result of results) tx.$queryRaw.mockResolvedValueOnce(result);
  const prisma = {
    withTenantContext: vi.fn(async (_societyId: string, operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
  };
  return { service: new SosService(prisma as unknown as PrismaService), prisma, tx };
}

describe('SosService incident assignment and evidence', () => {
  it('assigns only after validating active responder membership in the same tenant transaction', async () => {
    const assignedAt = new Date('2026-09-16T09:00:00Z');
    const acknowledgeDueAt = new Date('2026-09-16T09:15:00Z');
    const { service, prisma, tx } = setup([
      [{ id: 'incident-1', status: 'ACTIVE', societyId: 'society-1', severity: 'HIGH' }],
      [{ id: 'membership-1' }],
      [{ acknowledgeWithinMinutes: 15 }],
      [{ id: 'incident-1', status: 'ACTIVE', assignedResponderUserId: 'guard-1', assignedAt, acknowledgeDueAt }],
      [{ occurredAt: assignedAt }],
    ]);
    const result = await service.assign('society-1', 'supervisor-1', 'incident-1', 'guard-1', 'Take east gate response');

    const incident = tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(incident.strings.join(' ')).toContain('FOR UPDATE');
    const membership = tx.$queryRaw.mock.calls[1][0] as { strings: readonly string[]; values: unknown[] };
    expect(membership.strings.join(' ')).toContain('"SocietyMembership"');
    expect(membership.strings.join(' ')).toContain('JOIN "User"');
    expect(membership.strings.join(' ')).toContain(`u."status" = 'ACTIVE'`);
    expect(membership.strings.join(' ')).toContain('sm."active" = true');
    expect(membership.values).toContain('society-1');
    expect(membership.values).toContain('guard-1');
    expect(membership.values).toContain('SECURITY_GUARD');
    expect(membership.values).toContain('SECURITY_SUPERVISOR');
    const policy = tx.$queryRaw.mock.calls[2][0] as { strings: readonly string[]; values: unknown[] };
    expect(policy.strings.join(' ')).toContain('"SosRoutingPolicy"');
    expect(policy.values).toContain('HIGH');
    const assignment = tx.$queryRaw.mock.calls[3][0] as { strings: readonly string[]; values: unknown[] };
    expect(assignment.strings.join(' ')).toContain('"assignedResponderUserId"');
    expect(assignment.strings.join(' ')).toContain('"acknowledgeDueAt"');
    expect(assignment.strings.join(' ')).toContain('"autoEscalatedAt"=NULL');
    expect(assignment.values).toContain('guard-1');
    expect(assignment.values).toContain(15);
    const event = tx.$queryRaw.mock.calls[4][0] as { strings: readonly string[]; values: unknown[] };
    expect(event.strings.join(' ')).toContain("'ASSIGNED'");
    expect(event.values.some(value => typeof value === 'string' && value.includes('guard-1'))).toBe(true);
    expect(result).toMatchObject({ assignedToUserId: 'guard-1', assignedAt, acknowledgeDueAt });
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
  });

  it('rejects assignment when the target has no active responder membership', async () => {
    const { service, prisma, tx } = setup([
      [{ id: 'incident-1', status: 'ACTIVE', societyId: 'society-1' }],
      [],
    ]);
    await expect(service.assign('society-1', 'admin-1', 'incident-1', 'outsider-1')).rejects.toThrow(
      'Assignee must be an active SOS responder in this society',
    );
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
  });

  it('rejects assignment after an incident is closed', async () => {
    const { service, tx } = setup([[{ id: 'incident-1', status: 'RESOLVED', societyId: 'society-1' }]]);
    await expect(service.assign('society-1', 'admin-1', 'incident-1', 'guard-1')).rejects.toThrow(
      'Only active or acknowledged SOS incidents can be updated',
    );
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('stores evidence as an append-only private object reference inside tenant context', async () => {
    const occurredAt = new Date('2026-09-16T09:05:00Z');
    const { service, prisma, tx } = setup([
      [{ id: 'incident-1', status: 'ACTIVE', societyId: 'society-1' }],
      [{ id: 'event-1', occurredAt }],
    ]);
    const result = await service.addEvidence('society-1', 'guard-1', 'incident-1', {
      objectKey: 'sos/society-1/incident-1/photo-1.jpg',
      fileName: 'lift-panel.jpg',
      contentType: 'image/jpeg',
      note: 'Panel state on arrival',
    });
    const insert = tx.$queryRaw.mock.calls[1][0] as { strings: readonly string[]; values: unknown[] };
    expect(insert.strings.join(' ')).toContain("'EVIDENCE_ADDED'");
    expect(insert.values.some(value => typeof value === 'string' && value.includes('sos/society-1/incident-1/photo-1.jpg'))).toBe(true);
    expect(result).toMatchObject({
      id: 'event-1', incidentId: 'incident-1', objectKey: 'sos/society-1/incident-1/photo-1.jpg',
      fileName: 'lift-panel.jpg', contentType: 'image/jpeg',
    });
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
  });

  it('rejects externally reachable evidence URLs before writing an event', async () => {
    const { service, tx } = setup([[{ id: 'incident-1', status: 'ACTIVE', societyId: 'society-1' }]]);
    await expect(service.addEvidence('society-1', 'guard-1', 'incident-1', {
      objectKey: 'https://public.example/evidence.jpg', fileName: 'evidence.jpg',
    })).rejects.toThrow('Evidence must use a private object key, not a public URL');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects new evidence after an incident is closed', async () => {
    const { service, tx } = setup([[{ id: 'incident-1', status: 'CANCELLED', societyId: 'society-1' }]]);
    await expect(service.addEvidence('society-1', 'guard-1', 'incident-1', {
      objectKey: 'sos/society-1/incident-1/photo-2.jpg', fileName: 'closed.jpg',
    })).rejects.toThrow('Only active or acknowledged SOS incidents can be updated');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('lists evidence only after tenant-scoped incident lookup', async () => {
    const { service, prisma, tx } = setup([
      [{ id: 'incident-1', status: 'ACKNOWLEDGED', societyId: 'society-1' }],
      [],
    ]);
    await service.evidence('society-1', 'incident-1');
    const query = tx.$queryRaw.mock.calls[1][0] as { strings: readonly string[]; values: unknown[] };
    const sql = query.strings.join(' ');
    expect(sql).toContain('se."societyId"');
    expect(sql).toContain('se."incidentId"');
    expect(sql).toContain("se.\"action\" = 'EVIDENCE_ADDED'");
    expect(query.values).toContain('society-1');
    expect(query.values).toContain('incident-1');
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
  });

  it('reads incident history through the same society transaction', async () => {
    const { service, prisma, tx } = setup([
      [{ id: 'incident-1', status: 'ACTIVE', societyId: 'society-1' }],
      [{ id: 'event-1', action: 'TRIGGERED' }],
    ]);
    await expect(service.history('society-1', 'incident-1')).resolves.toEqual([{ id: 'event-1', action: 'TRIGGERED' }]);
    const query = tx.$queryRaw.mock.calls[1][0] as { strings: readonly string[]; values: unknown[] };
    expect(query.strings.join(' ')).toContain('FROM "SosIncidentEvent"');
    expect(query.values).toContain('society-1');
    expect(query.values).toContain('incident-1');
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
  });
});
