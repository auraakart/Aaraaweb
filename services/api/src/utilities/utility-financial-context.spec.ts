import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { UtilityChargesService } from './utility-charges.service';
import { UtilityInvoicesService } from './utility-invoices.service';
import { UtilityReadingImportService } from './utility-reading-import.service';

const scope = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const draftId = '33333333-3333-4333-8333-333333333333';
const input = { openingReadingId: 'opening', closingReadingId: 'closing' };
const invoiceInput = { billingPeriod: '2099-01', dueDate: '2099-02-15' };
const context = { meterId: 'meter', unitId: 'unit', meterType: 'WATER', openingAt: new Date('2099-01-01'), closingAt: new Date('2099-02-01'), openingValue: '10', closingValue: '20' };
const draft = { id: draftId, unitId: 'unit', meterId: 'meter', totalPaise: 1000, status: 'DRAFT', meterCode: 'W1', meterType: 'WATER' };
const invoice = { id: 'invoice', unitId: 'unit', amountPaise: 1000, invoiceNumber: 'UTIL-209901-33333333', dueDate: '2099-02-15' };
function fixture() {
  const tx = { $queryRaw: vi.fn().mockResolvedValue([]), $executeRaw: vi.fn().mockResolvedValue(1) };
  const committed: boolean[] = [];
  const withTenantContext = vi.fn(async (societyId: string, run: (client: typeof tx) => Promise<unknown>) => {
    expect(societyId).toBe(scope);
    const result = await run(tx);
    committed.push(true);
    return result;
  });
  const root = new Proxy({ withTenantContext }, { get(target, key) {
    if (key === 'withTenantContext') return target.withTenantContext;
    throw new Error('Root database access forbidden: ' + String(key));
  } });
  const publishResident = vi.fn((event: unknown) => { expect(event).toMatchObject({societyId: scope}); expect(committed).toHaveLength(2); });
  return { tx, withTenantContext, committed, publishResident,
    imports: new UtilityReadingImportService(root as never),
    charges: new UtilityChargesService(root as never),
    invoices: new UtilityInvoicesService(root as never, { publishResident } as never) };
}
function prepareDraft(tx: ReturnType<typeof fixture>['tx']) {
  tx.$queryRaw.mockResolvedValueOnce([context]).mockResolvedValueOnce([{count: 0n}])
    .mockResolvedValueOnce([{id: 'plan', fixedChargePaise: 0, minimumChargePaise: 0}])
    .mockResolvedValueOnce([{fromUnit: '0', toUnit: null, ratePaisePerUnit: '100'}])
    .mockResolvedValueOnce([{id: draftId}]);
}

describe('utility financial selected transactions', () => {
  it.each(['preview', 'commit'])('selects context for import %s and preserves imported provenance', async mode => {
    const f = fixture(); f.tx.$queryRaw.mockResolvedValueOnce([{id: 'meter', code: 'W1', active: true}])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([{id: 'reading'}]);
    const rows = [{meterCode: 'w1', readingAt: '2099-01-01', value: 10}];
    if (mode === 'preview') {
      expect(await f.imports.preview(scope, rows)).toMatchObject({valid: true, rowCount: 1});
      expect(f.tx.$executeRaw).not.toHaveBeenCalled();
    } else {
      expect(await f.imports.commit(scope, actor, rows)).toEqual({imported: 1, readingIds: ['reading'], source: 'IMPORT'});
      expect(f.tx.$executeRaw).toHaveBeenCalledOnce();
    }
    expect(f.withTenantContext).toHaveBeenCalledOnce();
  });
  it('does not commit readings when import audit insertion fails', async () => {
    const f = fixture(); f.tx.$queryRaw.mockResolvedValueOnce([{id: 'meter', code: 'W1', active: true}])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([{id: 'reading'}]);
    f.tx.$executeRaw.mockRejectedValue(new Error('audit denied'));
    await expect(f.imports.commit(scope, actor, [{meterCode: 'W1', readingAt: '2099-01-01', value: 10}])).rejects.toThrow('audit denied');
    expect(f.committed).toEqual([]);
  });

  it.each([
    [{meterCode: '', readingAt: '2099-01-01', value: 10}, 'INVALID_METER_CODE'],
    [{meterCode: 'W1', readingAt: 'invalid', value: 10}, 'INVALID_TIMESTAMP'],
    [{meterCode: 'W1', readingAt: '2099-01-01', value: -1}, 'INVALID_VALUE'],
    [{meterCode: 'W1', readingAt: '2099-01-01', value: 10, note: 'x'.repeat(301)}, 'NOTE_TOO_LONG'],
  ])('preserves import validation errors: %j', async (row, code) => {
    const f = fixture(); const result = await f.imports.preview(scope, [row]);
    expect(result.valid).toBe(false); expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({code})]));
  });
  it.each([0, 1001])('rejects invalid import batch size %s', async count => {
    const rows = Array.from({length: count}, () => ({meterCode: 'W1', readingAt: '2099-01-01', value: 10}));
    const f = fixture(); await expect(f.imports.preview(scope, rows)).rejects.toThrow();
    expect(f.tx.$queryRaw).not.toHaveBeenCalled();
  });
  it.each([
    [{readingAt: new Date('2098-12-01'), value: '20', readingKind: 'ACTUAL'}, 'READING_DECREASE'],
    [{readingAt: new Date('2099-02-01'), value: '5', readingKind: 'ACTUAL'}, 'READING_EXCEEDS_NEXT'],
    [{readingAt: new Date('2099-01-01'), value: '10', readingKind: 'ACTUAL'}, 'TIMESTAMP_ALREADY_EXISTS'],
  ])('preserves import ordering and duplicate evidence: %j', async (existing, code) => {
    const f = fixture(); f.tx.$queryRaw.mockResolvedValueOnce([{id: 'meter', code: 'W1', active: true}]).mockResolvedValueOnce([existing]);
    const result = await f.imports.preview(scope, [{meterCode: 'W1', readingAt: '2099-01-01', value: 10}]);
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({code})]));
  });
  it('lists charge drafts through the selected client', async () => {
    const f = fixture(); f.tx.$queryRaw.mockResolvedValue([{id: draftId}]);
    expect(await f.charges.listDrafts(scope)).toEqual([{id: draftId}]);
    expect(f.withTenantContext).toHaveBeenCalledOnce();
  });
  it('creates a calculated draft and audit atomically', async () => {
    const f = fixture(); prepareDraft(f.tx);
    expect(await f.charges.createDraft(scope, actor, input)).toMatchObject({id: draftId, status: 'DRAFT', totalPaise: 1000});
    expect(f.withTenantContext).toHaveBeenCalledOnce(); expect(f.tx.$executeRaw).toHaveBeenCalledOnce();
  });
  it('voids the selected draft and writes its evidence in one context', async () => {
    const f = fixture(); f.tx.$queryRaw.mockResolvedValueOnce([{id: draftId}]);
    expect(await f.charges.voidDraft(scope, actor, draftId)).toEqual({id: draftId, status: 'VOID'});
    expect(f.withTenantContext).toHaveBeenCalledOnce(); expect(f.tx.$executeRaw).toHaveBeenCalledOnce();
  });
  it.each(['create', 'void'])('does not return %s success when audit insertion fails', async mode => {
    const f = fixture();
    if (mode === 'create') prepareDraft(f.tx); else f.tx.$queryRaw.mockResolvedValueOnce([{id: draftId}]);
    f.tx.$executeRaw.mockRejectedValueOnce(new Error('audit denied'));
    const operation = mode === 'create' ? f.charges.createDraft(scope, actor, input) : f.charges.voidDraft(scope, actor, draftId);
    await expect(operation).rejects.toThrow('audit denied'); expect(f.committed).toEqual([]);
  });
  it.each([{code: '23505'}, {code: 'P2010', meta: {code: '23505'}}])('translates duplicate draft conflicts: %j', async error => {
    const f = fixture(); f.tx.$queryRaw.mockRejectedValue(error);
    await expect(f.charges.createDraft(scope, actor, input)).rejects.toBeInstanceOf(ConflictException);
  });
  it.each([
    [[], 'not found'], [[{...context, unitId: null}], 'assigned to a unit'],
    [[{...context, closingAt: context.openingAt}], 'later'], [[{...context, closingValue: '9'}], 'lower'],
  ])('rejects invalid reading context without writing: %j', async (rows, message) => {
    const f = fixture(); f.tx.$queryRaw.mockResolvedValueOnce(rows);
    await expect(f.charges.createDraft(scope, actor, input)).rejects.toThrow(String(message));
    expect(f.tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('rejects intervals crossing a meter reset', async () => {
    const f = fixture(); f.tx.$queryRaw.mockResolvedValueOnce([context]).mockResolvedValueOnce([{count: 1n}]);
    await expect(f.charges.createDraft(scope, actor, input)).rejects.toThrow('RESET');
    expect(f.tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('rejects a missing active tariff', async () => {
    const f = fixture(); f.tx.$queryRaw.mockResolvedValueOnce([context]).mockResolvedValueOnce([{count: 0n}]).mockResolvedValueOnce([]);
    await expect(f.charges.createDraft(scope, actor, input)).rejects.toThrow('No active');
  });
  it('rejects a tariff without slabs', async () => {
    const f = fixture(); f.tx.$queryRaw.mockResolvedValueOnce([context]).mockResolvedValueOnce([{count: 0n}])
      .mockResolvedValueOnce([{id: 'plan'}]).mockResolvedValueOnce([]);
    await expect(f.charges.createDraft(scope, actor, input)).rejects.toThrow('no slabs');
  });
  it('creates the invoice before selected recipient lookup and publishes only after both commits', async () => {
    const f = fixture(); f.tx.$queryRaw.mockResolvedValueOnce([draft]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([invoice]).mockResolvedValueOnce([{userId: 'owner'}, {userId: 'tenant'}]);
    expect(await f.invoices.issueFromDraft(scope, actor, draftId, invoiceInput)).toMatchObject({id: invoice.id, alreadyIssued: false});
    expect(f.withTenantContext).toHaveBeenCalledTimes(2); expect(f.publishResident).toHaveBeenCalledTimes(2);
    expect(f.publishResident.mock.calls[0][0]).toMatchObject({societyId: scope, userId: 'owner', invoiceId: invoice.id});
  });
  it('replays the same invoice without further writes or notifications', async () => {
    const f = fixture(); f.tx.$queryRaw.mockResolvedValueOnce([{...draft, status: 'ISSUED'}]).mockResolvedValueOnce([invoice]);
    expect(await f.invoices.issueFromDraft(scope, actor, draftId, invoiceInput)).toMatchObject({alreadyIssued: true});
    expect(f.withTenantContext).toHaveBeenCalledOnce(); expect(f.tx.$executeRaw).not.toHaveBeenCalled(); expect(f.publishResident).not.toHaveBeenCalled();
  });
  it.each([{...invoice, unitId: 'different-unit'}, {...invoice, amountPaise: 999}])('rejects inconsistent linked invoices: %j', async existing => {
    const f = fixture(); f.tx.$queryRaw.mockResolvedValueOnce([draft]).mockResolvedValueOnce([existing]);
    await expect(f.invoices.issueFromDraft(scope, actor, draftId, invoiceInput)).rejects.toThrow('does not match');
    expect(f.tx.$executeRaw).not.toHaveBeenCalled(); expect(f.publishResident).not.toHaveBeenCalled();
  });
  it('does not publish or resolve recipients after invoice audit failure', async () => {
    const f = fixture(); f.tx.$queryRaw.mockResolvedValueOnce([draft]).mockResolvedValueOnce([]).mockResolvedValueOnce([invoice]);
    f.tx.$executeRaw.mockResolvedValueOnce(1).mockRejectedValueOnce(new Error('audit denied'));
    await expect(f.invoices.issueFromDraft(scope, actor, draftId, invoiceInput)).rejects.toThrow('audit denied');
    expect(f.withTenantContext).toHaveBeenCalledOnce(); expect(f.publishResident).not.toHaveBeenCalled();
  });
  it.each(['2099-02-30', 'not-a-date'])('rejects invalid due dates %s before selecting context', async dueDate => {
    const f = fixture();
    await expect(f.invoices.issueFromDraft(scope, actor, draftId, {...invoiceInput, dueDate})).rejects.toThrow();
    expect(f.withTenantContext).not.toHaveBeenCalled();
  });
});
