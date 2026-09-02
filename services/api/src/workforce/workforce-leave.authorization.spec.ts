import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { FEATURE_KEY } from '../entitlements/feature.decorator';
import { WorkforceLeaveController } from './workforce-leave.controller';

describe('WorkforceLeaveController authorization', () => {
  it('requires domestic-help entitlement at controller scope', () => {
    expect(Reflect.getMetadata(FEATURE_KEY, WorkforceLeaveController)).toBe(ProductFeature.DOMESTIC_HELP);
  });

  it('uses own-workforce permissions for resident leave operations', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, WorkforceLeaveController.prototype.mine)).toEqual([AppPermission.WORKFORCE_READ_OWN]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, WorkforceLeaveController.prototype.create)).toEqual([AppPermission.WORKFORCE_MANAGE_OWN]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, WorkforceLeaveController.prototype.cancel)).toEqual([AppPermission.WORKFORCE_MANAGE_OWN]);
  });

  it('requires workforce review permission for society leave visibility', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, WorkforceLeaveController.prototype.activeForReview)).toEqual([AppPermission.WORKFORCE_REVIEW]);
  });
});
