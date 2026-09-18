import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { VendorContractsController } from './vendor-contracts.controller';

describe('VendorContractsController authorization',()=>{
 it('list requires SOCIETY_VENDORS_READ',()=>expect(Reflect.getMetadata(PERMISSIONS_KEY,VendorContractsController.prototype.list)).toEqual([AppPermission.SOCIETY_VENDORS_READ]));
 for(const method of ['create','status'] as const){it(`${method} requires SOCIETY_VENDORS_MANAGE`,()=>expect(Reflect.getMetadata(PERMISSIONS_KEY,VendorContractsController.prototype[method])).toEqual([AppPermission.SOCIETY_VENDORS_MANAGE]));}
});
