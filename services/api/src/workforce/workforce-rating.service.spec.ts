import { WorkforceAssignmentStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceRatingService } from './workforce-rating.service';

function setup(results: unknown[][]) {
  const tx = { $queryRaw: vi.fn() };
  for (const rows of results) tx.$queryRaw.mockResolvedValueOnce(rows);
  const prisma = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    withTenantContext: vi.fn(async (_society: string, operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
  };
  return { tx, prisma, service: new WorkforceRatingService(prisma as unknown as PrismaService) };
}
const sqlText = (value: unknown) => (value as { strings: readonly string[] }).strings.join(' ');

describe('V5.2.25 WorkforceRatingService tenant context', () => {
  it('lists ratings only through current occupancy on the society client', async () => {
    const { service, prisma, tx } = setup([[]]);
    await service.listMine('society-1', 'user-1');
    const query = tx.$queryRaw.mock.calls[0][0];
    expect(sqlText(query)).toContain('"UnitOccupancy"');
    expect(sqlText(query)).toContain('"effectiveTo" IS NULL');
    expect(sqlText(query)).not.toContain('"UnitResident"');
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects scores and oversized comments before querying or opening transactions', async () => {
    const { service, prisma } = setup([]);
    await expect(service.rateMine('society-1','user-1','assignment-1',{score:6}))
      .rejects.toThrow('Rating score must be an integer between 1 and 5');
    await expect(service.rateMine('society-1','user-1','assignment-1',{score:4,comment:'x'.repeat(301)}))
      .rejects.toThrow('Rating comment must be 300 characters or fewer');
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
  });

  it('denies a foreign or expired-occupancy assignment without a write', async () => {
    const { service, tx, prisma } = setup([[]]);
    await expect(service.rateMine('society-1','user-1','assignment-2',{score:5}))
      .rejects.toThrow('Workforce assignment not found');
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(sqlText(tx.$queryRaw.mock.calls[0][0])).toContain('FOR UPDATE OF wa');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects pending or rejected assignments before rating', async () => {
    const { service, tx } = setup([[{
      assignmentId:'assignment-1',workerId:'worker-1',status:WorkforceAssignmentStatus.PENDING,
    }]]);
    await expect(service.rateMine('society-1','user-1','assignment-1',{score:4}))
      .rejects.toThrow('Only approved or suspended workforce assignments can be rated');
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
  });

  it('locks authorization and inserts or updates rating with same tenant client', async () => {
    const row={id:'rating-1',societyId:'society-1',score:4};
    const { service, tx, prisma } = setup([
      [{assignmentId:'assignment-1',workerId:'worker-1',status:WorkforceAssignmentStatus.APPROVED}],
      [row],
    ]);
    await expect(service.rateMine('society-1','user-1','assignment-1',{score:4,comment:' Good '}))
      .resolves.toMatchObject(row);
    expect(sqlText(tx.$queryRaw.mock.calls[0][0])).toContain('FOR UPDATE OF wa');
    expect(sqlText(tx.$queryRaw.mock.calls[1][0])).toContain('ON CONFLICT ("assignmentId") DO UPDATE');
    expect((tx.$queryRaw.mock.calls[1][0] as {values:unknown[]}).values).toContain('Good');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('keeps suspended assignments eligible for rating', async () => {
    const {service}=setup([
      [{assignmentId:'assignment-1',workerId:'worker-1',status:WorkforceAssignmentStatus.SUSPENDED}],
      [{id:'rating-1',score:2}],
    ]);
    await expect(service.rateMine('society-1','user-1','assignment-1',{score:2}))
      .resolves.toMatchObject({score:2});
  });

  it('scopes society rating summary and converts aggregate count to number', async () => {
    const { service, tx, prisma } = setup([[{
      workerId:'worker-1',workerName:'Worker',workerPhone:'masked',workerRole:'MAID',
      ratingCount:2n,averageScore:4.5,
    }]]);
    await expect(service.societySummary('society-1')).resolves.toMatchObject([
      {workerId:'worker-1',ratingCount:2,averageScore:4.5},
    ]);
    expect((tx.$queryRaw.mock.calls[0][0] as {values:unknown[]}).values)
      .toContain('society-1');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
