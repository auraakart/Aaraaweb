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

  it('validates opening balance accounts and optional unit references', () => {
    const issues = service.validateReferences('OPENING_BALANCE', [
      { ledger_code: '9999', flat_number: 'A/102' },
      { ledger_code: '1100', flat_number: 'A/102' },
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

  it('creates a deterministic checksum independent of source key ordering', () => {
    const first = service.checksum('BUILDING', [{ code: 'A', name: 'Alpha' }]);
    const second = service.checksum('BUILDING', [{ name: 'Alpha', code: 'A' }]);
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });
});
