import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyIncidentService } from './privacy-incident.service';

function createService(rows: unknown[][]) {
  const tx = { $queryRaw: vi.fn(), $executeRaw: vi.fn().mockResolvedValue(1) };
  for (const row of rows) tx.$queryRaw.mockResolvedValueOnce(row);
  const prisma = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    withTenantContext: vi.fn(async (_id: string, fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { service: new PrivacyIncidentService(prisma as unknown as PrismaService), prisma, tx };
}

function sql(query: unknown) {
  return (query as { strings: readonly string[] }).strings.join(' ');
}

const input = {
  category: 'UNAUTHORIZED_ACCESS' as const,
  severity: 'HIGH' as const,
  summary: 'Credential compromise under investigation',
  affectedDataCategoryCodes: ['RESIDENT_IDENTITY'],
  minorDataSuspected: false,
  detectedAt: '2026-09-14T12:00:00.000Z',
};

describe('PrivacyIncidentService tenant-context and event invariants', () => {
  it('rejects category references outside the current society transaction', async () => {
    const { service, prisma, tx } = createService([[]]);
    await expect(service.createIncident('society-a', 'actor-1', input))
      .rejects.toThrow('Unknown or inactive privacy data categories');
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-a', expect.any(Function));
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(sql(tx.$queryRaw.mock.calls[0][0])).toContain('FOR SHARE');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects a foreign incident assignee before the incident is inserted', async () => {
    const { service, tx } = createService([[{ code: 'RESIDENT_IDENTITY' }], []]);
    await expect(service.createIncident('society-a', 'actor-1', { ...input, assignedToUserId: 'foreign-user' }))
      .rejects.toThrow('Privacy incident assignee must be an active member of the current society');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(sql(tx.$queryRaw.mock.calls[1][0])).toContain('FOR SHARE');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('records a valid incident and append-only evidence on one tenant client', async () => {
    const { service, prisma, tx } = createService([
      [{ code: 'RESIDENT_IDENTITY' }],
      [{ id: 'active-member' }],
      [{ id: 'incident-1', status: 'OPEN' }],
    ]);
    const incident = await service.createIncident('society-a', 'actor-1', {
      ...input, assignedToUserId: 'active-member',
    });
    expect(incident).toMatchObject({ id: 'incident-1', status: 'OPEN' });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(sql(tx.$executeRaw.mock.calls[0][0])).toContain('INCIDENT_CREATED');
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('revalidates closure with a row lock and forbids reopening', async () => {
    const { service, prisma, tx } = createService([
      [{ id: 'incident-1', societyId: 'society-a', status: 'CLOSED' }],
    ]);
    await expect(service.updateStatus('society-a', 'actor-1', 'incident-1', 'INVESTIGATING'))
      .rejects.toThrow('Closed privacy/security incidents cannot be reopened');
    expect(sql(tx.$queryRaw.mock.calls[0][0])).toContain('FOR UPDATE');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('does not append another event when the incident is already closed', async () => {
    const { service, tx } = createService([[{ id: 'incident-1', status: 'CLOSED' }]]);
    await expect(service.updateStatus('society-a', 'actor-1', 'incident-1', 'CLOSED'))
      .resolves.toMatchObject({ status: 'CLOSED' });
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('serializes a status transition and its event on the same client', async () => {
    const { service, prisma, tx } = createService([
      [{ id: 'incident-1', status: 'OPEN' }],
      [{ id: 'incident-1', status: 'INVESTIGATING' }],
    ]);
    await expect(service.updateStatus('society-a', 'actor-1', 'incident-1', 'INVESTIGATING'))
      .resolves.toMatchObject({ status: 'INVESTIGATING' });
    expect(sql(tx.$queryRaw.mock.calls[0][0])).toContain('FOR UPDATE');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(sql(tx.$executeRaw.mock.calls[0][0])).toContain('STATUS_CHANGED');
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-a', expect.any(Function));
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('propagates audit insert errors from the incident transition transaction', async () => {
    const { service, tx } = createService([
      [{ id: 'incident-1', status: 'OPEN' }],
      [{ id: 'incident-1', status: 'CONTAINING' }],
    ]);
    tx.$executeRaw.mockRejectedValueOnce(new Error('event insert unavailable'));
    await expect(service.updateStatus('society-a', 'actor-1', 'incident-1', 'CONTAINING'))
      .rejects.toThrow('event insert unavailable');
  });

  it('requires a society-matched incident before reading event history', async () => {
    const { service, prisma, tx } = createService([[]]);
    await expect(service.history('society-a', 'incident-in-society-b'))
      .rejects.toThrow('Privacy/security incident not found');
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('loads parent and evidence from one scoped client', async () => {
    const { service, tx } = createService([[{ id: 'incident-1' }], [{ eventType: 'INCIDENT_CREATED' }]]);
    await expect(service.history('society-a', 'incident-1'))
      .resolves.toEqual([{ eventType: 'INCIDENT_CREATED' }]);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    for (const [query] of tx.$queryRaw.mock.calls) {
      expect((query as { values: unknown[] }).values).toContain('society-a');
    }
  });

  it('scopes grievance contact upsert, read and incident listing', async () => {
    const { service, prisma, tx } = createService([
      [{ id: 'contact-1', displayName: 'Privacy Officer' }],
      [{ id: 'contact-1', displayName: 'Privacy Officer' }],
      [{ id: 'incident-1', status: 'OPEN' }],
    ]);
    await expect(service.upsertGrievanceContact('society-a', 'actor-1', {
      displayName: 'Privacy Officer', email: 'officer@example.com', active: true,
    })).resolves.toMatchObject({ id: 'contact-1' });
    await expect(service.getGrievanceContact('society-a')).resolves.toHaveLength(1);
    await expect(service.listIncidents('society-a')).resolves.toHaveLength(1);
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(3);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    for (const [query] of tx.$queryRaw.mock.calls) {
      expect((query as { values: unknown[] }).values).toContain('society-a');
    }
  });
});
