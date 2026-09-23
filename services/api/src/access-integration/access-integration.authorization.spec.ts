import { describe,expect,it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { AccessIntegrationController } from './access-integration.controller';

describe('V4.7 access integration authorization',()=>{
  for(const method of ['compatibility','adapters','health','devices','commands','events'] as const){
    it(`${method} requires gate read access`,()=>{
      expect(Reflect.getMetadata(PERMISSIONS_KEY,AccessIntegrationController.prototype[method])).toEqual([AppPermission.GATE_READ]);
    });
  }

  for(const method of ['command','simulatorHealth','simulatorCertification','createDevice','refreshDeviceHealth','deviceCommand','ingestEvent'] as const){
    it(`${method} requires gate management access`,()=>{
      expect(Reflect.getMetadata(PERMISSIONS_KEY,AccessIntegrationController.prototype[method])).toEqual([AppPermission.GATE_MANAGE]);
    });
  }
});
