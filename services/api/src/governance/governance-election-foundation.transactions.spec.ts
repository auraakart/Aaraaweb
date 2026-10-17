import { BadRequestException,ConflictException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { GovernanceElectionFoundationController } from './governance-election-foundation.controller';
const input={enabled:true,eligibilityMode:'VERIFIED_OWNERS' as const,policyReference:' Bye-laws '};
const policy={id:'policy',version:1,enabled:true,eligibilityMode:'VERIFIED_OWNERS_AND_ACTIVE_OCCUPANTS',createdByUserId:'policy-author'};
function fixture(rows:unknown[]=[]){
  const tx={$queryRaw:vi.fn().mockResolvedValue([]),$executeRaw:vi.fn().mockResolvedValue(1)};
  rows.forEach(value=>tx.$queryRaw.mockResolvedValueOnce(value));
  const forbidden=()=>{throw new Error('Global database client used');};
  const prisma={$queryRaw:vi.fn(forbidden),$transaction:vi.fn(forbidden),withTenantContext:vi.fn((_id:string,run:(client:typeof tx)=>unknown)=>run(tx))};
  return {tx,prisma,controller:new GovernanceElectionFoundationController(prisma as never)};
}
describe('election foundation tenant transactions',()=>{
  const operations=[
    {name:'currentPolicy',rows:[[policy]],run:(c:GovernanceElectionFoundationController)=>c.currentPolicy('society')},
    {name:'recordPolicy',rows:[[],[{version:1}],[{id:'policy',version:2}]],run:(c:GovernanceElectionFoundationController)=>c.recordPolicy('society','actor',input)},
    {name:'listSnapshots',rows:[],run:(c:GovernanceElectionFoundationController)=>c.listSnapshots('society')},
    {name:'getSnapshot',rows:[[{id:'snapshot'}],[{id:'member'}]],run:(c:GovernanceElectionFoundationController)=>c.getSnapshot('society','snapshot')},
    {name:'createSnapshot',rows:[[],[policy],[{id:'snapshot'}],[{memberCount:2}]],run:(c:GovernanceElectionFoundationController)=>c.createSnapshot('society','actor')},
  ];
  it.each(operations)('$name uses one scoped client',async({rows,run})=>{
    const {controller,prisma}=fixture(rows);await run(controller);
    expect(prisma.withTenantContext).toHaveBeenCalledExactlyOnceWith('society',expect.any(Function));
  });
  it('preserves the unconfigured default policy response',async()=>{
    const {controller}=fixture();await expect(controller.currentPolicy('society')).resolves.toEqual({configured:false,enabled:false});
  });
  it('rejects a foreign snapshot before loading members',async()=>{
    const {controller,tx}=fixture();await expect(controller.getSnapshot('society','foreign')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$queryRaw).toHaveBeenCalledOnce();expect((tx.$queryRaw.mock.calls[0][0] as {values:unknown[]}).values).toEqual(['foreign','society']);
  });
  it.each([{rows:[]},{rows:[{...policy,enabled:false}]},{rows:[{...policy,createdByUserId:'actor'}]}])('keeps policy prerequisites and separation of duties',async({rows})=>{
    const {controller,tx}=fixture([[],rows]);await expect(controller.createSnapshot('society','actor')).rejects.toBeInstanceOf(ConflictException);expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('retains owner-only capture without occupant insertion',async()=>{
    const {controller,tx}=fixture([[],[{...policy,eligibilityMode:'VERIFIED_OWNERS'}],[{id:'snapshot'}],[{memberCount:1}]]);
    await expect(controller.createSnapshot('society','actor')).resolves.toMatchObject({memberCount:1,ballotCastingEnabled:false});expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });
  it('propagates a later member insertion failure for rollback',async()=>{
    const {controller,tx}=fixture([[],[policy],[{id:'snapshot'}]]);tx.$executeRaw.mockResolvedValueOnce(1).mockRejectedValueOnce(new Error('Member insertion failed'));
    await expect(controller.createSnapshot('society','actor')).rejects.toThrow('Member insertion failed');expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
  });
  it('rejects absent actors and empty references before database context',async()=>{
    const {controller,prisma}=fixture();await expect(controller.recordPolicy('society','actor',{...input,policyReference:' '})).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.createSnapshot('society',undefined)).rejects.toBeInstanceOf(BadRequestException);expect(prisma.withTenantContext).not.toHaveBeenCalled();
  });
});
