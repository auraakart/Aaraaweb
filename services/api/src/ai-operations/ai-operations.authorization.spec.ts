import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { AiOperationsController } from './ai-operations.controller';

describe('V3.6 AI operations authorization',()=>{
  it('summary requires the resident helpdesk read boundary',()=>{
    expect(Reflect.getMetadata(PERMISSIONS_KEY,AiOperationsController.prototype.summary)).toEqual([AppPermission.HELPDESK_READ_OWN]);
  });

  for(const method of ['proposeHelpdesk','confirm','cancel'] as const){
    it(`${method} requires the existing resident helpdesk mutation permission`,()=>{
      expect(Reflect.getMetadata(PERMISSIONS_KEY,AiOperationsController.prototype[method])).toEqual([AppPermission.HELPDESK_MANAGE_OWN]);
    });
  }
});
