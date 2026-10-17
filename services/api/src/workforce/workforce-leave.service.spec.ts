import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceLeaveService } from './workforce-leave.service';

function setup(results: unknown[][]) {
  const tx = { $queryRaw: vi.fn() };
  for (const result of results) tx.$queryRaw.mockResolvedValueOnce(result);
  const prisma = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    withTenantContext: vi.fn(async (_societyId: string, operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
  };
  return { tx, prisma, service: new WorkforceLeaveService(prisma as unknown as PrismaService) };
}
function queryText(value: unknown) {
  return (value as {strings: readonly string[]}).strings.join(' ');
}

describe('V5.2.24 workforce leave relationship authorization and transactions', () => {
  it('lists household workforce leave only through current occupancy and tenant context', async () => {
    const {tx,prisma,service}=setup([[]]);
    await service.listMine('society-1','user-1');
    const sql=queryText(tx.$queryRaw.mock.calls[0][0]);
    expect(sql).toContain('"UnitOccupancy"');
    expect(sql).toContain('"effectiveFrom" <= CURRENT_TIMESTAMP');
    expect(sql).not.toContain('"UnitResident"');
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1',expect.any(Function));
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('serializes ownership, overlap and create in the same scoped transaction', async () => {
    const row={id:'leave-1',societyId:'society-1',active:true};
    const {tx,prisma,service}=setup([[{assignmentId:'assignment-1'}],[],[row]]);
    await expect(service.createMine('society-1','user-1',{
      assignmentId:'assignment-1',startsOn:'2026-11-11',endsOn:'2026-11-13',
    })).resolves.toMatchObject(row);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(queryText(tx.$queryRaw.mock.calls[0][0])).toContain('FOR UPDATE OF wa');
    expect(queryText(tx.$queryRaw.mock.calls[1][0])).toContain('"startsOn" <= ');
    expect(queryText(tx.$queryRaw.mock.calls[2][0])).toContain('INSERT INTO "WorkforceLeave"');
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects foreign assignments before looking for overlapping leaves', async () => {
    const {tx,service}=setup([[]]);
    await expect(service.createMine('society-1','user-1',{
      assignmentId:'foreign-assignment',startsOn:'2026-11-11',endsOn:'2026-11-13',
    })).rejects.toThrow('Active workforce assignment not found');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('fails closed on overlap before inserting another leave', async () => {
    const {tx,service}=setup([[{assignmentId:'assignment-1'}],[{id:'existing-leave'}]]);
    await expect(service.createMine('society-1','user-1',{
      assignmentId:'assignment-1',startsOn:'2026-11-12',endsOn:'2026-11-14',
    })).rejects.toThrow('An active workforce leave already overlaps this date range');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('validates dates before opening a transaction', async () => {
    const {prisma,service}=setup([]);
    await expect(service.createMine('society-1','user-1',{
      assignmentId:'assignment-1',startsOn:'2026-11-14',endsOn:'2026-11-12',
    })).rejects.toThrow('Leave end date must be on or after start date');
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
  });

  it('locks a society-owned active leave and cancels it in the same client', async () => {
    const {tx,prisma,service}=setup([[{id:'leave-1',assignmentId:'assignment-1'}],[{id:'leave-1',active:false}]]);
    await expect(service.cancelMine('society-1','user-1','leave-1'))
      .resolves.toMatchObject({id:'leave-1',active:false});
    expect(queryText(tx.$queryRaw.mock.calls[0][0])).toContain('FOR UPDATE OF wl');
    expect(queryText(tx.$queryRaw.mock.calls[1][0])).toContain('AND "active" = true');
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('does not cancel a foreign or inactive leave', async () => {
    const {tx,service}=setup([[]]);
    await expect(service.cancelMine('society-1','user-1','foreign-leave'))
      .rejects.toThrow('Active workforce leave not found');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('checks gate leave and review set within the requested society', async () => {
    const {tx,prisma,service}=setup([[{id:'leave-1'}],[{assignmentId:'assignment-1'}]]);
    await expect(service.assertNoActiveLeave('society-1','assignment-1',new Date('2026-11-12T12:00:00Z')))
      .rejects.toThrow('Worker is on approved leave today');
    await expect(service.activeAssignmentIds('society-1',['assignment-1'],new Date('2026-11-12T12:00:00Z')))
      .resolves.toEqual(new Set(['assignment-1']));
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(2);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    for (const [query] of tx.$queryRaw.mock.calls)
      expect((query as {values:unknown[]}).values).toContain('society-1');
  });

  it('returns an empty active assignment set without opening a transaction', async () => {
    const {prisma,service}=setup([]);
    expect(await service.activeAssignmentIds('society-1',[])).toEqual(new Set());
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
  });
});
