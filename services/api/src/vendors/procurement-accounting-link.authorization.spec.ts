import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProcurementAccountingLinkController } from './procurement-accounting-link.controller';

describe('ProcurementAccountingLinkController authorization', () => {
  for (const method of ['listPurchaseOrders','list'] as const) {
    it(`${method} requires FINANCE_READ`, () => {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, ProcurementAccountingLinkController.prototype[method])).toEqual([AppPermission.FINANCE_READ]);
    });
  }
  it('createExpense requires FINANCE_MANAGE', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ProcurementAccountingLinkController.prototype.createExpense)).toEqual([AppPermission.FINANCE_MANAGE]);
  });
});
