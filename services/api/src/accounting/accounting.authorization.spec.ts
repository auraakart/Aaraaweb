import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { AccountingController } from './accounting.controller';

describe('AccountingController authorization', () => {
  it('requires finance read for accounting queries', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, AccountingController.prototype.listAccounts)).toEqual([AppPermission.FINANCE_READ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, AccountingController.prototype.listPeriods)).toEqual([AppPermission.FINANCE_READ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, AccountingController.prototype.listJournals)).toEqual([AppPermission.FINANCE_READ]);
  });

  it('requires finance manage for accounting mutations', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, AccountingController.prototype.createAccount)).toEqual([AppPermission.FINANCE_MANAGE]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, AccountingController.prototype.createPeriod)).toEqual([AppPermission.FINANCE_MANAGE]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, AccountingController.prototype.createJournal)).toEqual([AppPermission.FINANCE_MANAGE]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, AccountingController.prototype.postJournal)).toEqual([AppPermission.FINANCE_MANAGE]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, AccountingController.prototype.reverseJournal)).toEqual([AppPermission.FINANCE_MANAGE]);
  });

  it('gates accounting behind the society accounting entitlement', () => {
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY, AccountingController)).toBe(ProductFeature.SOCIETY_ACCOUNTING);
  });
});
