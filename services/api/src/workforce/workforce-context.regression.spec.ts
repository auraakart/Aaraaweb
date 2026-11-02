import { describe, expect, it, vi } from 'vitest';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceService } from './workforce.service';

const society = 'society-a';
const request = { id: 'visit-a', unitId: 'unit-a', metadata: { workforceAssignmentId: 'assignment-a' } };
const receipt = { gateId: 'gate-a', action: 'CHECK_IN', accessRequestId: request.id };
const assignment = {
  id: 'assignment-a', householdId: 'household-a', workerId: 'worker-a', schedule: {},
  startDate: null, endDate: null,
  worker: { name: 'Maya', role: 'MAID', phone: '919999999999', active: true, verification: 'VERIFIED' },
  household: { unitId: 'unit-a', unit: { occupancies: [{ userId: 'former-resident' }] } },
};
function readClient(existingReceipt: unknown = null) {
  return {
    gate: { findFirst: vi.fn().mockResolvedValue({ id: 'gate-a' }) },
    gateMutationReceipt: { findUnique: vi.fn().mockResolvedValue(existingReceipt) },
    workforceAssignment: { findFirst: vi.fn().mockResolvedValue(assignment), findMany: vi.fn().mockResolvedValue([assignment]) },
    accessRequest: { findFirst: vi.fn().mockResolvedValue(request) },
    unitOccupancy: { findMany: vi.fn().mockResolvedValue([{ userId: 'current-resident', unitId: 'unit-a' }]) },
    household: { findMany: vi.fn().mockResolvedValue([{ id: 'household-a' }]) },
  };
}
function writer() {
  return {
    $queryRaw: vi.fn().mockResolvedValueOnce([{ id: 'gate-a' }])
      .mockResolvedValueOnce([{ id: assignment.id, workerId: assignment.workerId, schedule: {}, startDate: null, endDate: null }])
      .mockResolvedValueOnce([{ id: assignment.workerId }]),
    unitOccupancy: { findMany: vi.fn().mockResolvedValue([{ userId: 'current-resident' }]) },
    workforceLeave: { findFirst: vi.fn().mockResolvedValue(null) },
    accessRequest: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(request) },
    gateMutationReceipt: { create: vi.fn().mockResolvedValue({}) },
    auditEvent: { createMany: vi.fn().mockResolvedValue({ count: 3 }) },
  };
}
function selected(clients: object[], checkout = vi.fn()) {
  let inScope = false;
  const withTenantContext = vi.fn(async (_society: string, run: (tx: object) => Promise<unknown>, _options?: unknown) => {
    void _options;
    expect(_society).toBe(society);
    expect(inScope).toBe(false);
    const client = clients.shift();
    if (!client) throw new Error('Unexpected extra scope');
    inScope = true;
    try { return await run(client); } finally { inScope = false; }
  });
  const root = new Proxy({ withTenantContext }, {
    get(target, key) {
      if (key === 'withTenantContext') return target.withTenantContext;
      throw new Error(`Root database access forbidden: ${String(key)}`);
    },
  });
  const access = { checkOutRequest: vi.fn(async (...args: unknown[]) => {
    expect(inScope).toBe(false);
    return checkout(...args);
  }) };
  return { service: new WorkforceService(root as unknown as PrismaService, access as unknown as AccessService), withTenantContext, access };
}
const checkIn = (service: WorkforceService) => service.gateCheckIn(society, 'gate-a', assignment.id, 'guard-a', 'key-a');
const checkOut = (service: WorkforceService) => service.gateCheckOut(society, 'gate-a', assignment.id, 'guard-a', 'key-out');

describe('V5.14 household workforce selected transaction boundaries', () => {
  it('lists only current occupant households through the selected client and consistent parents', async () => {
    const tx = readClient();
    const { service } = selected([tx]);
    expect(await service.listMine(society, 'resident-a')).toEqual([assignment]);
    expect(tx.workforceAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      societyId: society, worker: { is: { societyId: society } },
      household: { is: { societyId: society, unit: { is: { societyId: society, building: { is: { societyId: society } } } } } },
      householdId: { in: ['household-a'] },
    }) }));
  });
  it('returns no households for a former occupant without querying assignments', async () => {
    const tx = readClient(); tx.unitOccupancy.findMany.mockResolvedValue([]);
    const { service } = selected([tx]);
    expect(await service.listMine(society, 'former-resident')).toEqual([]);
    expect(tx.workforceAssignment.findMany).not.toHaveBeenCalled();
  });
  it.each(['pending', 'review'])('scopes the %s reviewer list without root reads', async mode => {
    const tx = readClient(); const { service } = selected([tx]);
    await (mode === 'pending' ? service.listPending(society) : service.listForReview(society));
    expect(tx.workforceAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ societyId: society, worker: { is: { societyId: society } } }) }));
  });
  it('replays check-in using only the selected read and current occupants', async () => {
    const { service, withTenantContext } = selected([readClient(receipt)]);
    expect(await checkIn(service)).toEqual({ request, residentUserIds: ['current-resident'] });
    expect(withTenantContext).toHaveBeenCalledOnce();
  });
  it.each([
    [{ ...receipt, gateId: 'foreign-gate' }, 'different gate operation'],
    [{ ...receipt, action: 'CHECK_OUT' }, 'different gate operation'],
  ])('rejects a conflicting receipt before mutation', async (conflict, message) => {
    const { service, withTenantContext } = selected([readClient(conflict)]);
    await expect(checkIn(service)).rejects.toThrow(message);
    expect(withTenantContext).toHaveBeenCalledOnce();
  });
  it('rejects a replay bound to another workforce assignment', async () => {
    const tx = readClient(receipt); tx.accessRequest.findFirst.mockResolvedValue({ ...request, metadata: { workforceAssignmentId: 'other' } });
    await expect(checkIn(selected([tx]).service)).rejects.toThrow('different workforce assignment');
  });
  it('keeps final authorization and evidence in a separate serializable selected scope', async () => {
    const tx = writer(); const { service, withTenantContext } = selected([readClient(), tx]);
    expect(await checkIn(service)).toEqual({ request, residentUserIds: ['current-resident'] });
    expect(withTenantContext).toHaveBeenNthCalledWith(2, society, expect.any(Function), { isolationLevel: 'Serializable' });
    expect(tx.accessRequest.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ requestedById: 'current-resident' }) }));
    expect(tx.auditEvent.createMany).toHaveBeenCalledOnce();
    const sql = tx.$queryRaw.mock.calls[1][0] as { strings: string[]; values: unknown[] };
    expect(sql.strings.join('')).toContain('JOIN "Building"');
    expect(sql.values).toEqual(expect.arrayContaining([assignment.householdId, 'unit-a', assignment.workerId]));
  });
  it('recovers a concurrently committed receipt through a fresh selected scope after write failure', async () => {
    const tx = writer(); tx.accessRequest.create.mockRejectedValue(new Error('serialization failed'));
    const { service, withTenantContext } = selected([readClient(), tx, readClient(receipt)]);
    expect(await checkIn(service)).toEqual({ request, residentUserIds: ['current-resident'] });
    expect(withTenantContext).toHaveBeenCalledTimes(3);
  });
  it('preserves the original write failure if fresh recovery finds no receipt or active visit', async () => {
    const failure = new Error('audit insert denied'); const tx = writer(); tx.auditEvent.createMany.mockRejectedValue(failure);
    const recovery = readClient(); recovery.accessRequest.findFirst.mockResolvedValue(null);
    await expect(checkIn(selected([readClient(), tx, recovery]).service)).rejects.toBe(failure);
  });
  it('reports an active visit after a competing check-in instead of duplicating it', async () => {
    const tx = writer(); tx.accessRequest.create.mockRejectedValue(new Error('race'));
    await expect(checkIn(selected([readClient(), tx, readClient()]).service)).rejects.toThrow('already checked in');
  });
  it('commits checkout preflight before delegation and selects fresh recipient context afterward', async () => {
    const updated = { ...request, status: 'CHECKED_OUT' }; const checkout = vi.fn().mockResolvedValue(updated);
    const { service, access, withTenantContext } = selected([readClient(), readClient()], checkout);
    expect(await checkOut(service)).toEqual({ request: updated, residentUserIds: ['current-resident'] });
    expect(access.checkOutRequest).toHaveBeenCalledWith(society, 'gate-a', request.id, 'guard-a', 'key-out');
    expect(withTenantContext).toHaveBeenCalledTimes(2);
  });
  it('replays completed checkout without invoking the mutation delegate', async () => {
    const { service, access } = selected([readClient({ ...receipt, action: 'CHECK_OUT' })]);
    expect(await checkOut(service)).toEqual({ request, residentUserIds: ['current-resident'] });
    expect(access.checkOutRequest).not.toHaveBeenCalled();
  });
});
