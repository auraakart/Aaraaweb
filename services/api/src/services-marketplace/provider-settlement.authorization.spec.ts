import { describe,expect,it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProviderSettlementPlatformController } from './provider-settlement-platform.controller';

describe('Provider settlement authorization',()=>{
  it('keeps settlement reads and mutations separated',()=>{
    expect(Reflect.getMetadata(PERMISSIONS_KEY,ProviderSettlementPlatformController.prototype.list)).toEqual([AppPermission.PLATFORM_CONSUMER_PAYMENT_READ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY,ProviderSettlementPlatformController.prototype.create)).toEqual([AppPermission.PLATFORM_CONSUMER_PAYMENT_RECONCILE]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY,ProviderSettlementPlatformController.prototype.markPaid)).toEqual([AppPermission.PLATFORM_CONSUMER_PAYMENT_RECONCILE]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY,ProviderSettlementPlatformController.prototype.resolveRecovery)).toEqual([AppPermission.PLATFORM_CONSUMER_PAYMENT_RECONCILE]);
  });
});
