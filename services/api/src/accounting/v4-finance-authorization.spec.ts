import { describe,expect,it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { BankPositionController } from './bank-position.controller';
import { WaiverApprovalController } from './waiver-approval.controller';

describe('V4.1 finance authorization',()=>{
  it('keeps bank closing positions read-only',()=>{
    expect(Reflect.getMetadata(PERMISSIONS_KEY,BankPositionController.prototype.position)).toEqual([AppPermission.FINANCE_READ]);
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY,BankPositionController)).toBe(ProductFeature.SOCIETY_ACCOUNTING);
  });
  it('requires finance manage for waiver maker-checker mutations',()=>{
    expect(Reflect.getMetadata(PERMISSIONS_KEY,WaiverApprovalController.prototype.list)).toEqual([AppPermission.FINANCE_READ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY,WaiverApprovalController.prototype.request)).toEqual([AppPermission.FINANCE_MANAGE]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY,WaiverApprovalController.prototype.approve)).toEqual([AppPermission.FINANCE_MANAGE]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY,WaiverApprovalController.prototype.reject)).toEqual([AppPermission.FINANCE_MANAGE]);
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY,WaiverApprovalController)).toBe(ProductFeature.SOCIETY_ACCOUNTING);
  });
});
