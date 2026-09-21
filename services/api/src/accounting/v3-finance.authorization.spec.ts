import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { BankReconciliationController } from './bank-reconciliation.controller';
import { FinancialReportingController } from './financial-reporting.controller';

describe('V3.2 finance authorization', () => {
  it('keeps bank operations behind the accounting entitlement', () => {
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY,BankReconciliationController)).toBe(ProductFeature.SOCIETY_ACCOUNTING);
  });

  for(const method of ['listAccounts','listTransactions','summary'] as const){
    it(`bank ${method} requires FINANCE_READ`,()=>{
      expect(Reflect.getMetadata(PERMISSIONS_KEY,BankReconciliationController.prototype[method])).toEqual([AppPermission.FINANCE_READ]);
    });
  }
  for(const method of ['createAccount','previewImport','importTransaction','match','unmatch','ignore'] as const){
    it(`bank ${method} requires FINANCE_MANAGE`,()=>{
      expect(Reflect.getMetadata(PERMISSIONS_KEY,BankReconciliationController.prototype[method])).toEqual([AppPermission.FINANCE_MANAGE]);
    });
  }

  it('keeps financial reports behind the accounting entitlement',()=>{
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY,FinancialReportingController)).toBe(ProductFeature.SOCIETY_ACCOUNTING);
  });
  for(const method of ['trialBalance','incomeExpense','balanceSheet','defaulters','fundStatement'] as const){
    it(`report ${method} requires FINANCE_READ`,()=>{
      expect(Reflect.getMetadata(PERMISSIONS_KEY,FinancialReportingController.prototype[method])).toEqual([AppPermission.FINANCE_READ]);
    });
  }
});
