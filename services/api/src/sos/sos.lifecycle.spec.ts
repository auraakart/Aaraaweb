import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { SosService } from './sos.service';

const incident = (status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CANCELLED', residentUserId = 'resident-1') => ({
  id: 'incident-1',
  societyId: 'society-1',
  unitId: 'unit-1',
  residentUserId,
  status,
  category: 'MEDICAL',
  severity: 'HIGH',
  message: null,
  latitude: null,
  longitude: null,
  acknowledgedById: null,
  acknowledgedAt: null,
  resolvedById: null,
  resolvedAt: null,
  cancelledAt: null,
  createdAt: new Date('2026-11-01T10:00:00Z'),
  updatedAt: new Date('2026-11-01T10:00:00Z'),
});

function setup(current: ReturnType<typeof incident>, updatedStatus?: 'ACKNOWLEDGED' | 'RESOLVED' | 'CANCELLED') {
  const tx = {
    $queryRaw: vi.fn()
      .mockResolvedValueOnce([current])
      .mockResolvedValueOnce(updatedStatus ? [{ ...current, status: updatedStatus }] : []),
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  const prisma = {
    withTenantContext: vi.fn(async (_societyId: string, operation: (client: typeof tx) => unknown) => operation(tx)),
    $queryRaw: vi.fn(),
  };
  return { service: new SosService(prisma as unknown as PrismaService), prisma, tx };
}

describe('SosService lifecycle tenant isolation', () => {
  it('cancels only the resident-owned incident and writes status plus audit event in one tenant transaction', async () => {
    const { service, prisma, tx } = setup(incident('ACTIVE'), 'CANCELLED');
    await service.cancel('society-1', 'resident-1', 'incident-1', 'False alarm');

    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
    const lookup = tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(lookup.strings.join(' ')).toContain('FOR UPDATE');
    expect(lookup.values).toContain('society-1');
    expect(lookup.values).toContain('incident-1');
    const update = tx.$queryRaw.mock.calls[1][0] as { strings: readonly string[]; values: unknown[] };
    expect(update.strings.join(' ')).toContain('"status" =');
    expect(update.strings.join(' ')).toContain('"residentUserId"');
    expect(update.values).toContain('CANCELLED');
    const event = tx.$executeRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(event.strings.join(' ')).toContain('"SosIncidentEvent"');
    expect(event.values).toContain('CANCELLED');
    expect(event.values).toContain('False alarm');
  });

  it('acknowledges an active incident atomically within tenant context', async () => {
    const { service, prisma, tx } = setup(incident('ACTIVE'), 'ACKNOWLEDGED');
    await service.acknowledge('society-1', 'guard-1', 'incident-1', 'Guard responding');

    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
    const update = tx.$queryRaw.mock.calls[1][0] as { strings: readonly string[]; values: unknown[] };
    expect(update.strings.join(' ')).toContain('"acknowledgedById"');
    expect(update.values).toContain('ACKNOWLEDGED');
    expect(update.values).toContain('guard-1');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('resolves an acknowledged incident atomically within tenant context', async () => {
    const { service, prisma, tx } = setup(incident('ACKNOWLEDGED'), 'RESOLVED');
    await service.resolve('society-1', 'admin-1', 'incident-1', 'Situation cleared');

    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
    const update = tx.$queryRaw.mock.calls[1][0] as { strings: readonly string[]; values: unknown[] };
    expect(update.strings.join(' ')).toContain('"resolvedById"');
    expect(update.values).toContain('RESOLVED');
    expect(update.values).toContain('admin-1');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('does not write an audit event when the guarded status update loses a race', async () => {
    const { service, tx } = setup(incident('ACTIVE'));
    await expect(service.acknowledge('society-1', 'guard-1', 'incident-1')).rejects.toThrow(
      'SOS incident changed; refresh and retry',
    );
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('keeps cancellation private to the triggering resident', async () => {
    const { service, prisma, tx } = setup(incident('ACTIVE', 'another-resident'));
    await expect(service.cancel('society-1', 'resident-1', 'incident-1')).rejects.toThrow('SOS incident not found');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
  });
});
