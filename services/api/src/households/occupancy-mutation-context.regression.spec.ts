import { UnitRelation } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { OccupancyLifecycleService } from './occupancy-lifecycle.service';
import { OccupancyLifecycleSelfService } from './occupancy-lifecycle-self.service';
const scope = '11111111-1111-4111-8111-111111111111';
function fixture() {
  const row = { id: 'request', unitId: 'unit', userId: 'resident', occupancyId: 'occupancy', relation: UnitRelation.TENANT, kind: 'MOVE_OUT', status: 'APPROVED', effectiveAt: new Date(0) };
  const tx = {
    $queryRaw: vi.fn(async (sql: { text: string }) => sql.text.includes('COUNT(*)') ? [{ count: 0n }] : [row]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    unit: { findFirst: vi.fn().mockResolvedValue({ id: 'unit' }) },
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'resident' }) },
    unitOwnership: { findFirst: vi.fn().mockResolvedValue({ id: 'owner' }) },
    unitOccupancy: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'occupancy' }), update: vi.fn().mockResolvedValue({ id: 'occupancy' }) },
  };
  const withTenantContext = vi.fn(async (societyId: string, run: (client: typeof tx) => Promise<unknown>) => { expect(societyId).toBe(scope); return run(tx); });
  const prisma = new Proxy({ withTenantContext }, { get(target, key) { if (key === 'withTenantContext') return target.withTenantContext; throw new Error(`Unscoped database access: ${String(key)}`); } });
  return { tx, row, withTenantContext, prisma, service: new OccupancyLifecycleService(prisma as never) };
}
const input = { unitId: 'unit', userId: 'resident', relation: UnitRelation.TENANT, effectiveAt: new Date(0) };
describe('Occupancy mutation transaction boundaries', () => {
  it.each(['requestMoveIn','requestMoveInByPhone','requestOwnerMoveIn','requestMoveOut','requestMyMoveOut','review','setChecklistItem','addDocument','verifyDocument','complete'] as const)('uses one selected client for %s', async method => {
    const f = fixture();
    if (method === 'requestMoveIn' || method === 'requestOwnerMoveIn') await f.service[method](scope, 'owner', input);
    else if (method === 'requestMoveInByPhone') await f.service.requestMoveInByPhone(scope, 'operator', { ...input, tenantPhone: ' 999-888 ' });
    else if (method === 'requestMoveOut' || method === 'requestMyMoveOut') {
      f.tx.unitOccupancy.findFirst.mockResolvedValue({ id: 'occupancy', ...input } as never);
      await f.service[method](scope, 'resident', { occupancyId: 'occupancy', effectiveAt: new Date(0) });
    } else if (method === 'review') { f.row.status = 'REQUESTED'; await f.service.review(scope, 'operator', 'request', true); }
    else if (method === 'setChecklistItem') await f.service.setChecklistItem(scope, 'operator', 'request', 'item', true);
    else if (method === 'addDocument') await f.service.addDocument(scope, 'operator', 'request', ' ID ', ' reference ');
    else if (method === 'verifyDocument') await f.service.verifyDocument(scope, 'operator', 'request', 'document');
    else { f.tx.unitOccupancy.findFirst.mockResolvedValue({ id: 'occupancy' } as never); await f.service.complete(scope, 'operator', 'request'); }
    expect(f.withTenantContext).toHaveBeenCalledOnce();
  });
  it('rejects expired ownership or unrelated move-out authority before writing', async () => {
    const f = fixture(); f.tx.unitOwnership.findFirst.mockResolvedValue(null);
    await expect(f.service.requestOwnerMoveIn(scope, 'expired', input)).rejects.toThrow('Verified active ownership');
    expect(f.tx.unitOwnership.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({effectiveFrom:{lte:expect.any(Date)},OR:[{effectiveTo:null},{effectiveTo:{gt:expect.any(Date)}}]})}));
    await expect(f.service.requestMyMoveOut(scope, 'foreign', { occupancyId: 'occupancy', effectiveAt: new Date(0) })).rejects.toThrow('Your active occupancy');
    expect(f.tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('retains the family-member boundary and duplicate-request conflict mapping', async () => {
    const f = fixture();
    await expect(f.service.requestMoveIn(scope, 'owner', { ...input, relation: UnitRelation.FAMILY_MEMBER })).rejects.toThrow('household-member');
    f.tx.$queryRaw.mockRejectedValueOnce(new Error('duplicate key violates unique constraint'));
    await expect(f.service.requestMoveIn(scope, 'owner', input)).rejects.toThrow('active lifecycle request already exists');
  });
  it('denies missing scoped requests before checklist, document or approval writes', async () => {
    const f = fixture(); f.tx.$queryRaw.mockResolvedValue([]);
    await expect(f.service.review(scope, 'operator', 'foreign', true)).rejects.toThrow('not found');
    await expect(f.service.addDocument(scope, 'operator', 'foreign', 'ID', 'ref')).rejects.toThrow('not found');
    expect(f.tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('rechecks ownership after phone lookup before delegated request mutation', async () => {
    const f = fixture(); let open = false;
    f.withTenantContext.mockImplementation(async (_scope, run) => { open = true; try { return await run(f.tx); } finally { open = false; } });
    const lifecycle = { requestOwnerMoveIn: vi.fn(async () => { expect(open).toBe(false); throw new Error('Ownership revoked'); }) };
    const self = new OccupancyLifecycleSelfService(f.prisma as never, lifecycle as never);
    await expect(self.requestTenantMoveInByPhone(scope, 'owner', { unitId: 'unit', tenantPhone: '999', effectiveAt: new Date(0) })).rejects.toThrow('Ownership revoked');
    expect(f.tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('creates owner occupancy only after approval, effective time and checklist checks', async () => {
    const f = fixture(); f.row.kind = 'MOVE_IN';
    await f.service.complete(scope, 'operator', 'request');
    expect(f.tx.unitOccupancy.create).toHaveBeenCalledWith({ data: expect.objectContaining({ societyId: scope, unitId: 'unit', userId: 'resident', active: true }) });
    f.row.effectiveAt = new Date(Date.now() + 60_000);
    await expect(f.service.complete(scope, 'operator', 'request')).rejects.toThrow('effective time');
    f.row.effectiveAt = new Date(0); f.tx.$queryRaw.mockImplementation(async sql => sql.text.includes('COUNT(*)') ? [{ count: 1n }] : [f.row]);
    await expect(f.service.complete(scope, 'operator', 'request')).rejects.toThrow('checklist');
  });
  it.each(['empty', 'unregistered', 'own-account'])('preserves self phone validation for %s', async mode => {
    const f = fixture();
    if (mode === 'unregistered') f.tx.user.findUnique.mockResolvedValue(null);
    if (mode === 'own-account') f.tx.user.findUnique.mockResolvedValue({ id: 'owner' });
    const lifecycle = { requestOwnerMoveIn: vi.fn() };
    const self = new OccupancyLifecycleSelfService(f.prisma as never, lifecycle as never);
    await expect(self.requestTenantMoveInByPhone(scope, 'owner', { unitId: 'unit', tenantPhone: mode === 'empty' ? ' ' : '999', effectiveAt: new Date(0) })).rejects.toThrow(mode === 'empty' ? 'required' : mode === 'unregistered' ? 'register' : 'owner move-in');
    expect(lifecycle.requestOwnerMoveIn).not.toHaveBeenCalled();
  });

});
