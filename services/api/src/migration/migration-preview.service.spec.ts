import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { MigrationPreviewService } from './migration-preview.service';

describe('MigrationPreviewService', () => {
  const service = new MigrationPreviewService();

  it('normalizes common unit columns and detects duplicate units', () => {
    const result = service.preview('UNIT', [
      { 'Building Code': ' A ', 'Flat Number': ' 101 ' },
      { building: 'a', number: '101' },
      { building: 'A', number: '102' },
    ]);

    expect(result.totalRows).toBe(3);
    expect(result.validRows).toBe(2);
    expect(result.invalidRows).toBe(1);
    expect(result.duplicateRows).toBe(1);
    expect(result.normalizedRows[0]).toEqual({ building_code: 'A', flat_number: '101' });
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 2, code: 'DUPLICATE' }),
    ]));
  });

  it('rejects invalid resident occupancy values while accepting aliases', () => {
    const result = service.preview('RESIDENT', [
      { name: 'Anita Rao', mobile: '9000000001', flat_number: 'A-101', role: 'OWNER' },
      { name: 'Ravi Rao', mobile_number: '9000000002', unit: 'A-102', resident_type: 'GUEST' },
    ]);

    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(1);
    expect(result.issues).toContainEqual(expect.objectContaining({
      row: 2,
      field: 'occupancy_type',
      code: 'INVALID',
    }));
  });

  it('allows one resident identity across multiple units but rejects conflicting rows for the same unit', () => {
    const result = service.preview('RESIDENT', [
      { name: 'Anita Rao', mobile: '9000000001', unit: 'A/101', role: 'OWNER' },
      { name: 'Anita Rao', mobile: '9000000001', unit: 'A/102', role: 'OWNER' },
      { name: 'Anita Rao', mobile: '9000000001', unit: 'A/101', role: 'TENANT' },
    ]);
    expect(result.validRows).toBe(2);
    expect(result.invalidRows).toBe(1);
    expect(result.duplicateRows).toBe(1);
  });

  it('validates resident relationship flags before commit', () => {
    const result = service.preview('RESIDENT', [
      { name: 'Owner', mobile: '9000000010', unit: 'A/101', role: 'OWNER', is_occupant: 'no', ownership_verified: 'yes' },
      { name: 'Tenant', mobile: '9000000011', unit: 'A/102', role: 'TENANT', is_occupant: 'no' },
      { name: 'Family', mobile: '9000000012', unit: 'A/103', role: 'FAMILY_MEMBER', primary_gate_contact: 'maybe' },
    ]);
    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(2);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 2, field: 'is_occupant', code: 'INVALID' }),
      expect.objectContaining({ row: 3, field: 'primary_gate_contact', code: 'INVALID' }),
    ]));
  });

  it('validates opening balances in integer paise and debit-credit form', () => {
    const result = service.preview('OPENING_BALANCE', [
      { ledger_code: '1100', amount: '125000', debit_credit: 'DEBIT', flat_number: 'A-101', entry_date: '2026-04-01' },
      { account: '2100', amount: '125000', side: 'CREDIT', unit: 'A-102', cutover_date: '2026-04-01' },
      { account: '1100', amount: '125.50', side: 'SIDEWAYS', unit: 'A-103', entry_date: '2026-04-01' },
    ]);

    expect(result.validRows).toBe(2);
    expect(result.invalidRows).toBe(1);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 3, field: 'amount_paise', code: 'INVALID' }),
      expect.objectContaining({ row: 3, field: 'side', code: 'INVALID' }),
    ]));
  });

  it('does not treat different units on the same ledger as duplicate opening-balance rows', () => {
    const result = service.preview('OPENING_BALANCE', [
      { account_code: '1100', amount_paise: '1000', side: 'DEBIT', unit_ref: 'A-101', entry_date: '2026-04-01' },
      { account_code: '1100', amount_paise: '2000', side: 'DEBIT', unit_ref: 'A-102', entry_date: '2026-04-01' },
      { account_code: '2100', amount_paise: '3000', side: 'CREDIT', entry_date: '2026-04-01' },
    ]);

    expect(result.validRows).toBe(3);
    expect(result.duplicateRows).toBe(0);
  });

  it('rejects unbalanced or mixed-date opening balance batches', () => {
    const result = service.preview('OPENING_BALANCE', [
      { account_code: '1100', amount_paise: '1000', side: 'DEBIT', entry_date: '2026-04-01' },
      { account_code: '2100', amount_paise: '900', side: 'CREDIT', entry_date: '2026-04-02' },
    ]);
    expect(result.invalidRows).toBeGreaterThan(0);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'entry_date', code: 'INVALID' }),
      expect.objectContaining({ field: 'amount_paise', code: 'INVALID' }),
    ]));
  });

  it('requires stable building name and code before a structural batch can become ready', () => {
    const result = service.preview('BUILDING', [{ name: 'Alpha' }, { code: 'B' }, { name: 'Gamma', code: 'C' }]);
    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(2);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 1, field: 'code', code: 'REQUIRED' }),
      expect.objectContaining({ row: 2, field: 'name', code: 'REQUIRED' }),
    ]));
  });

  it('enforces domain-safe operational fields before a batch becomes READY', () => {
    const vehicles = service.preview('VEHICLE', [
      { vehicle_number: 'TN01AB1234', unit: 'A/101', vehicle_type: 'CAR' },
      { vehicle_number: 'TN01AB1235', unit: 'A/101', vehicle_type: 'BUS' },
    ]);
    expect(vehicles.validRows).toBe(1);
    expect(vehicles.issues).toContainEqual(expect.objectContaining({ row: 2, field: 'vehicle_type', code: 'INVALID' }));

    const workers = service.preview('WORKFORCE', [
      { name: 'Meena', mobile: '9000000001', worker_type: 'MAID' },
      { name: 'Ravi', mobile: '9000000002', worker_type: 'PLUMBER' },
    ]);
    expect(workers.validRows).toBe(1);
    expect(workers.issues).toContainEqual(expect.objectContaining({ row: 2, field: 'worker_type', code: 'INVALID' }));

    const vendors = service.preview('VENDOR', [{ name: 'Lift Co' }, { code: 'V1', name: 'Lift Co', category: 'LIFT' }]);
    expect(vendors.validRows).toBe(1);
    expect(vendors.invalidRows).toBe(1);

    const duplicateVendors = service.preview('VENDOR', [
      { code: 'V1', name: 'Lift Co', category: 'LIFT' },
      { code: 'v1', name: 'Lift Company Renamed', category: 'LIFT' },
    ]);
    expect(duplicateVendors.duplicateRows).toBe(1);
    expect(duplicateVendors.issues).toContainEqual(expect.objectContaining({ row: 2, code: 'DUPLICATE' }));
  });

  it('validates parking slot type and EV-ready flags', () => {
    const result = service.preview('PARKING', [
      { slot_code: 'P-101', slot_type: 'RESIDENT', ev_ready: 'yes' },
      { slot_code: 'P-102', slot_type: 'GARAGE', ev_ready: 'maybe' },
    ]);
    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(1);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 2, field: 'slot_type', code: 'INVALID' }),
      expect.objectContaining({ row: 2, field: 'ev_ready', code: 'INVALID' }),
    ]));
  });

  it('rejects empty and oversized preview batches before processing', () => {
    expect(() => service.preview('BUILDING', [])).toThrow(BadRequestException);
    const rows = Array.from({ length: 10001 }, (_, index) => ({ code: `B${index}` }));
    expect(() => service.preview('BUILDING', rows)).toThrow(BadRequestException);
  });
});
