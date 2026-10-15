import { describe, expect, it, vi } from 'vitest';
import { FacilitiesController } from './facilities.controller';

function sqlText(call: unknown) {
  return ((call as { strings?: readonly string[] }).strings ?? []).join(' ');
}

function sqlValues(call: unknown) {
  return (call as { values?: unknown[] }).values ?? [];
}

describe('FacilitiesController object scope', () => {
  it('fails closed before exposing work-order events outside the current society', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValueOnce([]) };
    const controller = new FacilitiesController(prisma as never);

    await expect(controller.listWorkOrderEvents(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    )).rejects.toThrow('Facility work order not found');

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const query = prisma.$queryRaw.mock.calls[0][0];
    expect(sqlText(query)).toContain('"id"=');
    expect(sqlText(query)).toContain('"societyId"=');
    expect(sqlValues(query)).toContain('11111111-1111-4111-8111-111111111111');
    expect(sqlValues(query)).toContain('22222222-2222-4222-8222-222222222222');
  });

  it('fails closed before mutating a work order outside the current society', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([]),
      $executeRaw: vi.fn(),
    };
    const prisma = {
      $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)),
    };
    const controller = new FacilitiesController(prisma as never);

    await expect(controller.setWorkOrderStatus(
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
      '22222222-2222-4222-8222-222222222222',
      { status: 'CANCELLED' },
    )).rejects.toThrow('Facility work order not found');

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    const query = tx.$queryRaw.mock.calls[0][0];
    expect(sqlText(query)).toContain('"societyId"=');
    expect(sqlText(query)).toContain('FOR UPDATE');
    expect(sqlValues(query)).toContain('11111111-1111-4111-8111-111111111111');
    expect(sqlValues(query)).toContain('22222222-2222-4222-8222-222222222222');
  });
});
