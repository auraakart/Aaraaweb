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

  it('validates opening balances in integer paise and debit-credit form', () => {
    const result = service.preview('OPENING_BALANCE', [
      { ledger_code: '1100', amount: '125000', debit_credit: 'DEBIT', flat_number: 'A-101' },
      { account: '1100', amount: '125.50', side: 'SIDEWAYS', unit: 'A-102' },
    ]);

    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(1);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 2, field: 'amount_paise', code: 'INVALID' }),
      expect.objectContaining({ row: 2, field: 'side', code: 'INVALID' }),
    ]));
  });

  it('does not treat different units on the same ledger as duplicate opening-balance rows', () => {
    const result = service.preview('OPENING_BALANCE', [
      { account_code: '1100', amount_paise: '1000', side: 'DEBIT', unit_ref: 'A-101' },
      { account_code: '1100', amount_paise: '2000', side: 'DEBIT', unit_ref: 'A-102' },
    ]);

    expect(result.validRows).toBe(2);
    expect(result.duplicateRows).toBe(0);
  });

  it('rejects empty and oversized preview batches before processing', () => {
    expect(() => service.preview('BUILDING', [])).toThrow(BadRequestException);
    const rows = Array.from({ length: 10001 }, (_, index) => ({ code: `B${index}` }));
    expect(() => service.preview('BUILDING', rows)).toThrow(BadRequestException);
  });
});
