import { BadRequestException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { GovernanceCommunityController } from './governance-community.controller';
import { GovernanceService } from './governance.service';

function fixture(rows:unknown[]=[]){
  const tx={$queryRaw:vi.fn().mockResolvedValue([]),$executeRaw:vi.fn().mockResolvedValue(1)};
  rows.forEach(value=>tx.$queryRaw.mockResolvedValueOnce(value));
  const forbidden=()=>{throw new Error('Global database client used');};
  const prisma={$queryRaw:vi.fn(forbidden),$transaction:vi.fn(forbidden),
    withTenantContext:vi.fn((_society:string,run:(client:typeof tx)=>unknown)=>run(tx))};
  const governance=new GovernanceService(prisma as never);
  return {tx,prisma,controller:new GovernanceCommunityController(prisma as never,governance)};
}
describe('community governance tenant transactions',()=>{
  it.each(['listMeetings','listDocuments'] as const)('%s uses only the scoped client',async method=>{
    const {controller,prisma,tx}=fixture();await controller[method]('society','actor');
    expect(prisma.withTenantContext).toHaveBeenCalledExactlyOnceWith('society',expect.any(Function));
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect((tx.$queryRaw.mock.calls[0][0] as {values:unknown[]}).values).toContain('society');
  });
  it('loads visibility and the unchanged meeting aggregate in one context',async()=>{
    const {controller,prisma,tx}=fixture([[{id:'meeting'}],[{id:'meeting',title:'AGM'}],[{id:'agenda'}],[],[],[]]);
    await expect(controller.getMeeting('society','actor','meeting')).resolves.toEqual({id:'meeting',title:'AGM',agenda:[{id:'agenda'}],resolutions:[],actions:[],evidence:[]});
    expect(prisma.withTenantContext).toHaveBeenCalledOnce();expect(tx.$queryRaw).toHaveBeenCalledTimes(6);
    expect((tx.$queryRaw.mock.calls[0][0] as {sql:string}).sql).toContain('FOR SHARE');
  });
  it('rejects inaccessible meetings before reading children',async()=>{
    const {controller,tx}=fixture();await expect(controller.getMeeting('society','actor','foreign')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
  });
  for(const kind of ['meeting','document','poll']){
    it(`${kind} audience change and audit share one scoped client`,async()=>{
      const {controller,prisma,tx}=fixture([[{audienceScope:'COMMUNITY'}],[{id:'resource',audienceScope:'OWNER_ONLY'}]]);
      await expect(controller.setAudience('society','actor',kind,'resource',{audienceScope:'OWNER_ONLY'})).resolves.toEqual({id:'resource',audienceScope:'OWNER_ONLY'});
      expect(prisma.withTenantContext).toHaveBeenCalledOnce();expect(tx.$executeRaw).toHaveBeenCalledOnce();
    });
    it(`${kind} rejects foreign resources without mutation or audit`,async()=>{
      const {controller,tx}=fixture();await expect(controller.setAudience('society','actor',kind,'foreign',{audienceScope:'OWNER_ONLY'})).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.$queryRaw).toHaveBeenCalledOnce();expect(tx.$executeRaw).not.toHaveBeenCalled();
    });
  }
  it('preserves idempotent audience retries without duplicate audit',async()=>{
    const {controller,tx}=fixture([[{audienceScope:'OWNER_ONLY'}]]);
    await expect(controller.setAudience('society','actor','meeting','resource',{audienceScope:'OWNER_ONLY'})).resolves.toMatchObject({idempotent:true});
    expect(tx.$executeRaw).not.toHaveBeenCalled();expect(tx.$queryRaw).toHaveBeenCalledOnce();
  });
  it('propagates audit failure to the transaction owner',async()=>{
    const {controller,tx}=fixture([[{audienceScope:'COMMUNITY'}],[{id:'resource'}]]);tx.$executeRaw.mockRejectedValueOnce(new Error('Audit unavailable'));
    await expect(controller.setAudience('society','actor','meeting','resource',{audienceScope:'OWNER_ONLY'})).rejects.toThrow('Audit unavailable');
  });
  it('rejects absent actors and unsupported kinds before opening a context',async()=>{
    const {controller,prisma}=fixture();
    expect(()=>controller.listMeetings('society',undefined)).toThrow(BadRequestException);
    await expect(controller.setAudience('society','actor','unknown','resource',{audienceScope:'COMMUNITY'})).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
  });
});
