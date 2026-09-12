import 'reflect-metadata';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { AppPermission } from '../auth/permission.types';
import { FEATURE_KEY } from '../entitlements/feature.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { FinanceOperationsController } from './finance-operations.controller';

describe('FinanceOperationsController authorization',()=>{
  const read=['listExpenses','listPayables','listBudgets','budgetVsActual','fundUtilization','exportSnapshot'] as const;
  const manage=['createExpense','approveExpense','postExpense','settlePayable','createBudget','approveBudget','lockBudget'] as const;
  it('requires accounting entitlement',()=>expect(Reflect.getMetadata(FEATURE_KEY,FinanceOperationsController)).toBe(ProductFeature.SOCIETY_ACCOUNTING));
  for(const method of read)it(`${method} requires FINANCE_READ`,()=>expect(Reflect.getMetadata(PERMISSIONS_KEY,FinanceOperationsController.prototype[method])).toEqual([AppPermission.FINANCE_READ]));
  for(const method of manage)it(`${method} requires FINANCE_MANAGE`,()=>expect(Reflect.getMetadata(PERMISSIONS_KEY,FinanceOperationsController.prototype[method])).toEqual([AppPermission.FINANCE_MANAGE]));
});
