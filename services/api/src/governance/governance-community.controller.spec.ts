import { BadRequestException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { GovernanceCommunityController } from './governance-community.controller';

describe('V3.8 governance community audience boundary',()=>{
  for(const method of ['listMeetings','getMeeting','listDocuments'] as const){
    it(`${method} uses the existing resident notice-read boundary`,()=>{
      expect(Reflect.getMetadata(PERMISSIONS_KEY,GovernanceCommunityController.prototype[method])).toEqual([AppPermission.NOTICE_READ]);
    });
  }

  it('audience changes require governance management permission',()=>{
    expect(Reflect.getMetadata(PERMISSIONS_KEY,GovernanceCommunityController.prototype.setAudience)).toEqual([AppPermission.GOVERNANCE_MANAGE]);
  });

  it('fails closed before loading meeting detail when relationship/audience lookup returns nothing',async()=>{
    const tx={$queryRaw:vi.fn().mockResolvedValue([])};
    const prisma={withTenantContext:vi.fn((_society:string,run:(client:typeof tx)=>unknown)=>run(tx))};
    const governance={getMeetingInContext:vi.fn()};
    const controller=new GovernanceCommunityController(prisma as never,governance as never);
    await expect(controller.getMeeting('society-1','user-1','11111111-1111-4111-8111-111111111111')).rejects.toBeInstanceOf(BadRequestException);
    expect(governance.getMeetingInContext).not.toHaveBeenCalled();
  });

  it('delegates to the authoritative governance service only after visibility is proven',async()=>{
    const tx={$queryRaw:vi.fn().mockResolvedValue([{id:'meeting-1'}])};
    const prisma={withTenantContext:vi.fn((_society:string,run:(client:typeof tx)=>unknown)=>run(tx))};
    const governance={getMeetingInContext:vi.fn().mockResolvedValue({id:'meeting-1',title:'AGM'})};
    const controller=new GovernanceCommunityController(prisma as never,governance as never);
    await expect(controller.getMeeting('society-1','user-1','11111111-1111-4111-8111-111111111111')).resolves.toEqual({id:'meeting-1',title:'AGM'});
    expect(governance.getMeetingInContext).toHaveBeenCalledWith(tx,'society-1','11111111-1111-4111-8111-111111111111');
  });
});
