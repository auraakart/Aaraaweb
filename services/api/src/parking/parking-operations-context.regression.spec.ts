import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ParkingOperationsService } from './parking-operations.service';

const societyId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const entityId = '33333333-3333-4333-8333-333333333333';
const policy = { maxActiveResidentVehicles: 2, requireCredential: true, allowTemporaryOverflow: false };

function fixture() {
  const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };
  const prisma = new Proxy({ withTenantContext: vi.fn(async (scope: string, run: (client: typeof tx) => Promise<unknown>) => {
    if (scope !== societyId) throw new Error('Missing tenant context');
    return run(tx);
  }) }, { get(target, key) {
    if (key === 'withTenantContext') return target.withTenantContext;
    throw new Error(`Unscoped database access: ${String(key)}`);
  } });
  return { tx, prisma, service: new ParkingOperationsService(prisma as never) };
}

describe('Parking operations tenant context', () => {
  it.each(['policy', 'credentials', 'violations'] as const)('reads %s through the selected tenant without root access', async method => {
    const { tx, prisma, service } = fixture();
    expect(await service[method](societyId)).toEqual([]);
    expect(prisma.withTenantContext).toHaveBeenCalledOnce();
    const sql = tx.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(sql.values).toContain(societyId);
    if (method !== 'policy') expect(sql.sql).toContain('LIMIT 500');
    if (method === 'credentials') expect(sql.sql).toContain('b."societyId"=u."societyId"');
  });

  it('upserts policy and retains actor and all flags inside its tenant context', async () => {
    const { tx, prisma, service } = fixture();
    tx.$queryRaw.mockResolvedValue([{ societyId, ...policy }]);
    expect(await service.updatePolicy(societyId, actorId, policy)).toEqual({ societyId, ...policy });
    expect(prisma.withTenantContext).toHaveBeenCalledOnce();
    const sql = tx.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(sql.sql).toContain('ON CONFLICT ("societyId") DO UPDATE');
    expect(sql.values).toEqual([societyId, 2, true, false, actorId]);
  });

  it.each([0, 13, 1.5, NaN])('rejects invalid policy limit %s before persistence', async maxActiveResidentVehicles => {
    const { prisma, service } = fixture();
    await expect(service.updatePolicy(societyId, actorId, { ...policy, maxActiveResidentVehicles })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
  });

  it.each(['', 'xx', 'x'.repeat(81)])('rejects invalid credential length before context entry: %s', async credential => {
    const { prisma, service } = fixture();
    await expect(service.issueCredential(societyId, actorId, { vehicleId: entityId, credential })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
  });

  it.each([undefined, ' Note '])('normalizes credentials and checks same-society household before insert, note %s', async note => {
    const { tx, prisma, service } = fixture();
    tx.$queryRaw.mockResolvedValueOnce([{ id: entityId }]).mockResolvedValueOnce([{ id: entityId, credential: 'PARK-1' }]);
    expect(await service.issueCredential(societyId, actorId, { vehicleId: entityId, credential: ' park-1 ', note })).toHaveProperty('credential', 'PARK-1');
    expect(prisma.withTenantContext).toHaveBeenCalledOnce();
    const lookup = tx.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(lookup.sql).toContain('h."societyId"=hv."societyId"');
    expect(lookup.values).toEqual([entityId, societyId]);
    expect((tx.$queryRaw.mock.calls[1][0] as Prisma.Sql).values).toEqual([societyId, entityId, 'PARK-1', actorId, note ? 'Note' : null]);
  });

  it('rejects absent, inactive or foreign vehicles before credential insert', async () => {
    const { tx, service } = fixture();
    await expect(service.issueCredential(societyId, actorId, { vehicleId: entityId, credential: 'PARK-1' })).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
  });

  it.each([{ code: '23505' }, { code: 'P2010', meta: { code: '23505' } }])('maps actual native/wrapped uniqueness shapes to conflict: %j', async error => {
    const { tx, service } = fixture();
    tx.$queryRaw.mockResolvedValueOnce([{ id: entityId }]).mockRejectedValueOnce(error);
    await expect(service.issueCredential(societyId, actorId, { vehicleId: entityId, credential: 'PARK-1' })).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([null, {}, new Error('Unavailable'), { code: 'P2010' }, { code: 'P2010', meta: { code: '42501' } }, { code: 'other', meta: { code: '23505' } }, new BadRequestException('Invalid')])('preserves unrelated issuance failures: %j', async error => {
    const { tx, service } = fixture();
    tx.$queryRaw.mockRejectedValue(error);
    await expect(service.issueCredential(societyId, actorId, { vehicleId: entityId, credential: 'PARK-1' })).rejects.toBe(error);
  });

  it.each([undefined, ' ', ' Done '])('revokes active credentials with actor/time and retained note semantics: %s', async note => {
    const { tx, prisma, service } = fixture();
    tx.$queryRaw.mockResolvedValue([{ id: entityId, status: 'REVOKED' }]);
    expect(await service.revokeCredential(societyId, actorId, entityId, note)).toHaveProperty('status', 'REVOKED');
    expect(prisma.withTenantContext).toHaveBeenCalledOnce();
    const sql = tx.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(sql.sql).toContain('"status"=\'ACTIVE\'');
    expect(sql.sql).toContain('COALESCE(');
    expect(sql.values).toEqual([actorId, note?.trim() || null, entityId, societyId]);
  });

  it.each([{ slotId: entityId }, { vehicleId: entityId }, { permitId: entityId }])('reports normalized violations retaining every optional-reference society check: %j', async reference => {
    const { tx, prisma, service } = fixture();
    tx.$queryRaw.mockResolvedValue([{ id: entityId }]);
    await service.reportViolation(societyId, actorId, { ...reference, code: ' wrong slot ' });
    expect(prisma.withTenantContext).toHaveBeenCalledOnce();
    const sql = tx.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(sql.values).toContain('WRONG_SLOT');
    expect(sql.values).toContain('WARNING');
    expect(sql.sql.match(/EXISTS\(SELECT 1 FROM/g)).toHaveLength(3);
  });

  it('keeps explicit violation severity, note and resolution in the selected context', async () => {
    const { tx, service } = fixture();
    tx.$queryRaw.mockResolvedValue([{ id: entityId }]);
    await service.reportViolation(societyId, actorId, { slotId: entityId, vehicleId: entityId, permitId: entityId, code: 'hazard', severity: 'CRITICAL', note: ' Clear access ' });
    expect((tx.$queryRaw.mock.calls[0][0] as Prisma.Sql).values).toContain('Clear access');
    await service.resolveViolation(societyId, actorId, entityId, ' Resolved ');
    const sql = tx.$queryRaw.mock.calls[1][0] as Prisma.Sql;
    expect(sql.sql).toContain('"status"=\'OPEN\'');
    expect(sql.values).toEqual([actorId, 'Resolved', entityId, societyId]);
    await service.resolveViolation(societyId, actorId, entityId);
    expect((tx.$queryRaw.mock.calls[2][0] as Prisma.Sql).values).toContain(null);
  });

  it.each(['', 'x'.repeat(41)])('rejects invalid violation code before context entry: %s', async code => {
    const { prisma, service } = fixture();
    await expect(service.reportViolation(societyId, actorId, { slotId: entityId, code })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
  });

  it('denies foreign/missing and already terminal entities', async () => {
    const { service } = fixture();
    await expect(service.revokeCredential(societyId, actorId, entityId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.resolveViolation(societyId, actorId, entityId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.reportViolation(societyId, actorId, { slotId: entityId, code: 'hazard' })).rejects.toBeInstanceOf(NotFoundException);
  });

  const operations: Array<[string, (service: ParkingOperationsService) => Promise<unknown>]> = [
    ['policy', service => service.policy('')], ['credentials', service => service.credentials('')], ['violations', service => service.violations('')],
    ['updatePolicy', service => service.updatePolicy('', actorId, policy)],
    ['issueCredential', service => service.issueCredential('', actorId, { vehicleId: entityId, credential: 'PARK-1' })],
    ['revokeCredential', service => service.revokeCredential('', actorId, entityId)],
    ['reportViolation', service => service.reportViolation('', actorId, { slotId: entityId, code: 'hazard' })],
    ['resolveViolation', service => service.resolveViolation('', actorId, entityId)],
  ];
  it.each(operations)('rejects absent context without a root fallback: %s', async (_name, run) => {
    const { tx, service } = fixture();
    await expect(run(service)).rejects.toThrow('Missing tenant context');
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
});
