import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { AppPermission, ROLE_PERMISSIONS } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { GuardOperationsController } from './guard-operations.controller';
import { GuardOperationsService } from './guard-operations.service';

describe('V3.3 guard operations boundaries',()=>{
  it('keeps supervisor-only mutations away from ordinary guards',()=>{
    expect(ROLE_PERMISSIONS[AppRole.SECURITY_SUPERVISOR]).toContain(AppPermission.GATE_SUPERVISE);
    expect(ROLE_PERMISSIONS[AppRole.SECURITY_GUARD]).not.toContain(AppPermission.GATE_SUPERVISE);
    expect(Reflect.getMetadata(PERMISSIONS_KEY,GuardOperationsController.prototype.createWatchlist)).toEqual([AppPermission.GATE_SUPERVISE]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY,GuardOperationsController.prototype.createCheckpoint)).toEqual([AppPermission.GATE_SUPERVISE]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY,GuardOperationsController.prototype.reviewIncident)).toEqual([AppPermission.GATE_SUPERVISE]);
  });

  for(const method of ['summary','overstays','watchlist','passes','createPass','processPass','checkpoints','scanCheckpoint','incidents','createIncident'] as const){
    it(`${method} requires gate processing authority`,()=>{
      expect(Reflect.getMetadata(PERMISSIONS_KEY,GuardOperationsController.prototype[method])).toEqual([AppPermission.GATE_ACCESS_PROCESS]);
    });
  }

  it('rejects a gate from another society before creating a material pass',async()=>{
    const queryRaw=vi.fn().mockResolvedValue([]);
    const service=new GuardOperationsService({$queryRaw:queryRaw,$executeRaw:vi.fn()} as never);
    await expect(service.createPass('society-a','user-a',{
      gateId:'00000000-0000-0000-0000-000000000001',referenceCode:'OUT-1',movementType:'MATERIAL_OUT',subjectName:'Vendor',itemDescription:'Pump motor',
    })).rejects.toBeInstanceOf(BadRequestException);
    const sql=queryRaw.mock.calls[0][0] as {values?:unknown[]};
    expect(sql.values).toContain('society-a');
  });

  it('scopes overstay queries to the authenticated society',async()=>{
    const queryRaw=vi.fn().mockResolvedValue([]);
    const service=new GuardOperationsService({$queryRaw:queryRaw} as never);
    await service.overstays('society-b',240);
    const sql=queryRaw.mock.calls[0][0] as {values?:unknown[]};
    expect(sql.values).toContain('society-b');
  });
});
