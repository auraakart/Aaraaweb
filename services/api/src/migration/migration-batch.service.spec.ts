import { describe, expect, it } from 'vitest';
import { MigrationBatchService } from './migration-batch.service';

const service = new MigrationBatchService({} as never, {} as never);

describe('MigrationBatchService evidence', () => {
  const snapshot = {
    buildings: [{ code: 'A', name: 'Alpha' }, { code: 'B', name: 'Beta' }],
    units: [
      { number: '101', buildingCode: 'A', buildingName: 'Alpha' },
      { number: '101', buildingCode: 'B', buildingName: 'Beta' },
      { number: '102', buildingCode: 'A', buildingName: 'Alpha' },
    ],
    accounts: [{ code: '1100' }],
    vehicles: [{ plateNumber: 'TN-01 AB 1234' }],
    workers: [{ phone: '9000000001' }],
    vendors: [{ code: 'V001', name: 'Lift Co', gstin: '33ABCDE1234F1Z5' }],
    parkingSlots: [{ code: 'P-001' }],
    funds: [{ code: 'CORPUS', name: 'Corpus Fund' }],
    periods: [{ startsOn: new Date('2026-04-01T00:00:00.000Z'), endsOn: new Date('2027-03-31T00:00:00.000Z'), status: 'OPEN' }],
    residentRelations: [
      { phone: '9000000003', unitNumber: '102', buildingCode: 'A', buildingName: 'Alpha', relation: 'OWNER' },
    ],
  };

  it('fails missing building references and existing unit conflicts', () => {
    const missing = service.validateReferences('UNIT', [{ building_code: 'Z', flat_number: '101' }], snapshot);
    expect(missing).toContainEqual(expect.objectContaining({ code: 'REFERENCE_MISSING', field: 'building_ref' }));

    const conflict = service.validateReferences('UNIT', [{ building_code: 'A', flat_number: '101' }], snapshot);
    expect(conflict).toContainEqual(expect.objectContaining({ code: 'EXISTING_CONFLICT', field: 'unit_number' }));
  });

  it('requires a qualified unit reference when unit numbers are ambiguous', () => {
    const ambiguous = service.validateReferences('RESIDENT', [{ unit: '101' }], snapshot);
    expect(ambiguous).toContainEqual(expect.objectContaining({ code: 'REFERENCE_AMBIGUOUS', field: 'unit_ref' }));

    const qualified = service.validateReferences('RESIDENT', [{ unit: 'A/101' }], snapshot);
    expect(qualified).toEqual([]);
  });

  it('rejects an existing active resident-unit relationship before commit', () => {
    const issues = service.validateReferences('RESIDENT', [
      { phone: '9000000003', unit: 'A/102', occupancy_type: 'TENANT' },
    ], snapshot);
    expect(issues).toContainEqual(expect.objectContaining({
      field: 'phone',
      code: 'EXISTING_CONFLICT',
    }));
  });

  it('validates opening balance accounts and optional unit references', () => {
    const issues = service.validateReferences('OPENING_BALANCE', [
      { ledger_code: '9999', flat_number: 'A/102', entry_date: '2026-04-01' },
      { ledger_code: '1100', flat_number: 'A/102', entry_date: '2026-04-01' },
    ], snapshot);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual(expect.objectContaining({ row: 1, field: 'account_code', code: 'REFERENCE_MISSING' }));
  });

  it('detects existing operational identities inside the active society', () => {
    expect(service.validateReferences('VEHICLE', [{ vehicle_number: 'TN01AB1234', unit: 'A/102' }], snapshot))
      .toContainEqual(expect.objectContaining({ code: 'EXISTING_CONFLICT', field: 'registration_number' }));
    expect(service.validateReferences('WORKFORCE', [{ mobile: '9000000001' }], snapshot))
      .toContainEqual(expect.objectContaining({ code: 'EXISTING_CONFLICT', field: 'phone' }));
    expect(service.validateReferences('VENDOR', [{ code: 'v001' }], snapshot))
      .toContainEqual(expect.objectContaining({ code: 'EXISTING_CONFLICT', field: 'name' }));
  });

  it('validates parking building references and existing slot codes', () => {
    expect(service.validateReferences('PARKING', [{ slot_code: 'P-002', building_ref: 'Z' }], snapshot))
      .toContainEqual(expect.objectContaining({ code: 'REFERENCE_MISSING', field: 'building_ref' }));
    expect(service.validateReferences('PARKING', [{ slot_code: 'p-001', building_ref: 'A' }], snapshot))
      .toContainEqual(expect.objectContaining({ code: 'EXISTING_CONFLICT', field: 'slot_code' }));
  });

  it('validates opening balance fund and open-period references', () => {
    const issues = service.validateReferences('OPENING_BALANCE', [
      { ledger_code: '1100', fund_ref: 'missing', entry_date: '2026-04-01' },
      { ledger_code: '1100', fund_ref: 'CORPUS', entry_date: '2030-04-01' },
    ], snapshot);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 1, field: 'fund_ref', code: 'REFERENCE_MISSING' }),
      expect.objectContaining({ row: 2, field: 'entry_date', code: 'REFERENCE_MISSING' }),
    ]));
  });

  it('keeps batch lookup society-scoped and exports auditable CSV evidence', async () => {
    const queries: unknown[] = [];
    const prisma = {
      $queryRaw: async (query: unknown) => {
        queries.push(query);
        if (queries.length === 1) return [{ id: 'batch-1', societyId: 'society-a', entityType: 'BUILDING', status: 'READY', checksum: 'abc' }];
        if (queries.length === 2) return [{ id: 'row-1', rowNumber: 1, normalized: { code: 'A', name: 'Alpha' }, identityKey: 'a', valid: true, issues: [], targetType: null, targetId: null, committedAt: null, rolledBackAt: null }];
        return [];
      },
    };
    const scoped = new MigrationBatchService(prisma as never, {} as never);
    const csv = await scoped.exportEvidenceCsv('society-a', 'batch-1');
    const sql = String((queries[0] as { strings?: readonly string[] }).strings?.join('') ?? '');
    expect(sql).toContain('"societyId"=');
    expect(csv).toContain('"batch-1"');
    expect(csv).toContain('"Alpha"');
  });

  it('reports opening-balance journal reconciliation from authoritative ledger rows', async () => {
    const prisma = {
      $queryRaw: (() => {
        let call = 0;
        return async () => {
          call += 1;
          if (call === 1) return [{ id: 'batch-1', societyId: 'society-a', entityType: 'OPENING_BALANCE', status: 'COMMITTED', checksum: 'abc' }];
          if (call === 2) return [{ id: 'row-1', rowNumber: 1, normalized: {}, identityKey: '1100||', valid: true, issues: [], targetType: 'JournalEntry', targetId: '22222222-2222-2222-2222-222222222222', committedAt: new Date(), rolledBackAt: null }];
          if (call === 3) return [];
          return [{ id: '22222222-2222-2222-2222-222222222222', status: 'POSTED', debitPaise: 5000, creditPaise: 5000, reversalId: null }];
        };
      })(),
    };
    const scoped = new MigrationBatchService(prisma as never, {} as never);
    const detail = await scoped.getBatch('society-a', 'batch-1') as { financeReconciliation: { balanced: boolean; debitPaise: number; creditPaise: number } };
    expect(detail.financeReconciliation).toEqual(expect.objectContaining({
      balanced: true,
      debitPaise: 5000,
      creditPaise: 5000,
    }));
  });

  it('creates a deterministic checksum independent of source key ordering', () => {
    const first = service.checksum('BUILDING', [{ code: 'A', name: 'Alpha' }]);
    const second = service.checksum('BUILDING', [{ name: 'Alpha', code: 'A' }]);
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });
});
