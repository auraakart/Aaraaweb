import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MigrationOpeningBalanceCommitService } from './migration-opening-balance-commit.service';

const societyId = '33333333-3333-3333-3333-333333333333';
const actorId = '44444444-4444-4444-4444-444444444444';
const batchId = '11111111-1111-1111-1111-111111111111';
const journalId = '22222222-2222-2222-2222-222222222222';
const row = (id: string, overrides = {}) => ({
  id, rowNumber: id === 'row-a' ? 1 : 2, normalized: {},
  valid: true, targetId: journalId, ...overrides,
});
const batch = (status = 'COMMITTED') => ({ id: batchId, status, totalRows: 2 });

function setup(outputs: unknown[]) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn(),
  };
  for (const output of outputs) {
    tx.$queryRaw.mockResolvedValueOnce(output);
  }
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const accounting = { reverseJournalWithinTransaction: vi.fn().mockResolvedValue({ id: 'reversal-1' }) };
  const service = new MigrationOpeningBalanceCommitService(
    prisma as never, {} as never, accounting as never,
  );
  return { tx, prisma, accounting, service };
}

describe('MigrationOpeningBalanceCommitService V5.6.7 rollback atomicity', () => {
  it('supports only opening-balance batches', () => {
    const service = new MigrationOpeningBalanceCommitService({} as never, {} as never, {} as never);
    expect(service.supports('OPENING_BALANCE')).toBe(true);
    expect(service.supports('RESIDENT')).toBe(false);
  });

  for (const [scenario, rows] of [
    ['a committed row is missing', [row('row-a')]],
    ['a committed row is invalid', [row('row-a'), row('row-b', { valid: false })]],
    ['journal evidence is split', [row('row-a'), row('row-b', { targetId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' })]],
  ] as const) {
    it('does not reverse a journal when ' + scenario, async () => {
      const { service, tx, accounting } = setup([[batch()], rows]);
      await expect(service.rollback(societyId, actorId, batchId))
        .rejects.toThrow('Opening-balance migration journal evidence is incomplete');
      expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1); // lock only
      expect(accounting.reverseJournalWithinTransaction).not.toHaveBeenCalled();
    });
  }

  it('rejects a non-committed batch before journal reads or reversal', async () => {
    const { service, tx, accounting } = setup([[batch('READY')]]);
    await expect(service.rollback(societyId, actorId, batchId))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(accounting.reverseJournalWithinTransaction).not.toHaveBeenCalled();
  });

  it('treats an already rolled-back batch as an idempotent no-op', async () => {
    const { service, tx, accounting } = setup([[batch('ROLLED_BACK')]]);
    await expect(service.rollback(societyId, actorId, batchId))
      .resolves.toMatchObject({ status: 'ROLLED_BACK' });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(accounting.reverseJournalWithinTransaction).not.toHaveBeenCalled();
  });

  it('blocks rollback when no open accounting period exists for a posted journal reversal', async () => {
    const { service, tx, accounting } = setup([
      [batch()], [row('row-a'), row('row-b')], [{ status: 'POSTED' }], [],
    ]);
    await expect(service.rollback(societyId, actorId, batchId))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(4);
    expect(accounting.reverseJournalWithinTransaction).not.toHaveBeenCalled();
  });

  it('reverses journal and changes batch state using the same live transaction', async () => {
    const today = new Date('2026-10-01T00:00:00.000Z');
    const period = { startsOn: today, endsOn: new Date('2026-10-31T00:00:00.000Z') };
    const updated = { id: batchId, status: 'ROLLED_BACK' };
    const { service, tx, prisma, accounting } = setup([
      [batch()], [row('row-a'), row('row-b')], [{ status: 'POSTED' }],
      [period], [updated],
    ]);
    await expect(service.rollback(societyId, actorId, batchId)).resolves.toEqual(updated);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(accounting.reverseJournalWithinTransaction).toHaveBeenCalledTimes(1);
    expect(accounting.reverseJournalWithinTransaction).toHaveBeenCalledWith(
      tx, societyId, actorId, journalId, expect.objectContaining({
        entryNumber: 'MIG-RV-1111111111111111', reason: 'Rollback opening-balance migration ' + batchId,
      }),
    );
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2); // advisory lock + row status update
    expect(tx.$queryRaw).toHaveBeenCalledTimes(5);
    const invocation = accounting.reverseJournalWithinTransaction.mock.invocationCallOrder[0];
    expect(invocation).toBeGreaterThan(tx.$queryRaw.mock.invocationCallOrder[3]); // reversal after date
    expect(invocation).toBeLessThan(tx.$executeRaw.mock.invocationCallOrder[1]); // before row update
  });

  it('propagates migration status-write failure from the containing journal transaction', async () => {
    const period = {
      startsOn: new Date('2026-10-01T00:00:00.000Z'),
      endsOn: new Date('2026-10-31T00:00:00.000Z'),
    };
    const { service, tx, accounting } = setup([
      [batch()], [row('row-a'), row('row-b')], [{ status: 'POSTED' }],
      [period], [],
    ]);
    await expect(service.rollback(societyId, actorId, batchId))
      .rejects.toThrow('Opening-balance rollback state update failed');
    expect(accounting.reverseJournalWithinTransaction).toHaveBeenCalledOnce();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    // The failed status write and journal operation occur in one transaction,
    // so a real PostgreSQL callback rejection rolls both back.
  });

  it('recovers a genuine legacy migration reversal without posting another journal', async () => {
    const { service, tx, accounting } = setup([
      [batch()], [row('row-a'), row('row-b')], [{ status: 'REVERSED' }],
      [{ id: 'existing-migration-reversal' }],
      [{ id: batchId, status: 'ROLLED_BACK' }],
    ]);
    await expect(service.rollback(societyId, actorId, batchId))
      .resolves.toMatchObject({ status: 'ROLLED_BACK' });
    expect(accounting.reverseJournalWithinTransaction).not.toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(5);
    const reversalLookup = tx.$queryRaw.mock.calls[3][0];
    expect(reversalLookup.strings.join(' ')).toContain('"entryNumber"=');
    expect(reversalLookup.values).toContain('MIG-RV-1111111111111111');
    expect(reversalLookup.values).toContain('Reversal: Rollback opening-balance migration ' + batchId);
  });

  it('rejects an already reversed journal without matching migration-specific reversal evidence', async () => {
    const { service, tx, accounting } = setup([
      [batch()], [row('row-a'), row('row-b')], [{ status: 'REVERSED' }], [],
    ]);
    await expect(service.rollback(societyId, actorId, batchId))
      .rejects.toThrow('Opening-balance migration reversal evidence is incomplete');
    expect(accounting.reverseJournalWithinTransaction).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(4);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1); // advisory lock only
  });

});
