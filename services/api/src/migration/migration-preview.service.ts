import { BadRequestException, Injectable } from '@nestjs/common';

export type MigrationEntityType =
  | 'BUILDING'
  | 'UNIT'
  | 'RESIDENT'
  | 'VEHICLE'
  | 'PARKING'
  | 'WORKFORCE'
  | 'VENDOR'
  | 'OPENING_BALANCE';

export interface MigrationPreviewIssue {
  row: number;
  field?: string;
  code: 'REQUIRED' | 'INVALID' | 'DUPLICATE';
  message: string;
}

export interface MigrationPreviewResult {
  entityType: MigrationEntityType;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  normalizedRows: Record<string, string>[];
  issues: MigrationPreviewIssue[];
}

@Injectable()
export class MigrationPreviewService {
  preview(entityType: MigrationEntityType, inputRows: Record<string, unknown>[]): MigrationPreviewResult {
    if (!Array.isArray(inputRows) || inputRows.length === 0) {
      throw new BadRequestException('At least one migration row is required');
    }
    if (inputRows.length > 10_000) {
      throw new BadRequestException('A preview batch cannot exceed 10000 rows');
    }

    const normalizedRows = inputRows.map((row) => this.normalizeRow(row));
    const issues: MigrationPreviewIssue[] = [];
    const invalid = new Set<number>();
    const duplicate = new Set<number>();
    const seen = new Map<string, number>();

    normalizedRows.forEach((row, index) => {
      const rowNumber = index + 1;
      for (const issue of this.validateRow(entityType, row, rowNumber)) {
        issues.push(issue);
        invalid.add(rowNumber);
      }

      const key = this.identityKey(entityType, row);
      if (!key) return;
      const first = seen.get(key);
      if (first != null) {
        issues.push({ row: rowNumber, code: 'DUPLICATE', message: `Duplicates row ${first} for ${key}` });
        duplicate.add(rowNumber);
        invalid.add(rowNumber);
      } else {
        seen.set(key, rowNumber);
      }
    });

    return {
      entityType,
      totalRows: normalizedRows.length,
      validRows: normalizedRows.length - invalid.size,
      invalidRows: invalid.size,
      duplicateRows: duplicate.size,
      normalizedRows,
      issues,
    };
  }

  private normalizeRow(row: Record<string, unknown>) {
    const normalized: Record<string, string> = {};
    for (const [rawKey, rawValue] of Object.entries(row ?? {})) {
      const key = rawKey.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      if (!key) continue;
      const value = rawValue == null ? '' : String(rawValue).trim();
      normalized[key] = value;
    }
    return normalized;
  }

  private validateRow(entityType: MigrationEntityType, row: Record<string, string>, rowNumber: number) {
    const issues: MigrationPreviewIssue[] = [];
    const required = (field: string, aliases: string[] = []) => {
      if (!this.value(row, field, aliases)) {
        issues.push({ row: rowNumber, field, code: 'REQUIRED' as const, message: `${field} is required` });
      }
    };

    switch (entityType) {
      case 'BUILDING':
        required('name');
        required('code');
        break;
      case 'UNIT':
        required('unit_number', ['number', 'flat_number']);
        required('building_ref', ['building', 'building_code']);
        break;
      case 'RESIDENT': {
        required('name');
        required('phone', ['mobile', 'mobile_number']);
        required('unit_ref', ['unit', 'flat_number']);
        const occupancy = this.value(row, 'occupancy_type', ['resident_type', 'role']).toUpperCase();
        if (occupancy && !['OWNER', 'TENANT', 'FAMILY_MEMBER'].includes(occupancy)) {
          issues.push({ row: rowNumber, field: 'occupancy_type', code: 'INVALID', message: 'occupancy_type must be OWNER, TENANT or FAMILY_MEMBER' });
        }
        break;
      }
      case 'VEHICLE':
        required('registration_number', ['vehicle_number', 'registration']);
        required('unit_ref', ['unit', 'flat_number']);
        break;
      case 'PARKING':
        required('slot_code', ['parking_slot', 'slot']);
        break;
      case 'WORKFORCE':
        required('name');
        required('phone', ['mobile', 'mobile_number']);
        required('worker_type', ['type', 'category']);
        break;
      case 'VENDOR':
        required('name', ['vendor_name']);
        break;
      case 'OPENING_BALANCE': {
        required('account_code', ['ledger_code', 'account']);
        required('amount_paise', ['amount']);
        const amount = this.value(row, 'amount_paise', ['amount']);
        if (amount && !/^-?\d+$/.test(amount)) {
          issues.push({ row: rowNumber, field: 'amount_paise', code: 'INVALID', message: 'amount_paise must be an integer number of paise' });
        }
        const side = this.value(row, 'side', ['debit_credit']).toUpperCase();
        if (side && !['DEBIT', 'CREDIT'].includes(side)) {
          issues.push({ row: rowNumber, field: 'side', code: 'INVALID', message: 'side must be DEBIT or CREDIT' });
        }
        break;
      }
    }
    return issues;
  }

  private identityKey(entityType: MigrationEntityType, row: Record<string, string>) {
    const value = (...keys: string[]) => keys.map((key) => row[key]).find((item) => item?.trim())?.trim().toLowerCase() ?? '';
    switch (entityType) {
      case 'BUILDING': return value('external_id') || value('code') || value('name');
      case 'UNIT': return `${value('building_ref', 'building', 'building_code')}|${value('unit_number', 'number', 'flat_number')}`;
      case 'RESIDENT': return value('external_id') || value('phone', 'mobile', 'mobile_number');
      case 'VEHICLE': return value('registration_number', 'vehicle_number', 'registration').replace(/\s+/g, '');
      case 'PARKING': return value('slot_code', 'parking_slot', 'slot');
      case 'WORKFORCE': return value('external_id') || value('phone', 'mobile', 'mobile_number');
      case 'VENDOR': return value('external_id') || value('gstin') || value('name', 'vendor_name');
      case 'OPENING_BALANCE': return `${value('account_code', 'ledger_code', 'account')}|${value('unit_ref', 'unit', 'flat_number')}|${value('fund_ref', 'fund')}`;
    }
  }

  private value(row: Record<string, string>, field: string, aliases: string[] = []) {
    for (const key of [field, ...aliases]) {
      const value = row[key]?.trim();
      if (value) return value;
    }
    return '';
  }
}
