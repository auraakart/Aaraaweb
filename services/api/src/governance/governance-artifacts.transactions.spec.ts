import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { GovernanceArtifactsController } from './governance-artifacts.controller';

const documentInput={kind:'MINUTES',fileReference:'fixture/minutes.pdf'};
const pollInput={meetingId:'meeting',pollType:'ADVISORY' as const,title:' Budget ',options:[' Yes ',' No ']};
function fixture(results:unknown[]=[]){
  const tx={$queryRaw:vi.fn().mockResolvedValue([]),$executeRaw:vi.fn().mockResolvedValue(1)};
  results.forEach(rows=>tx.$queryRaw.mockResolvedValueOnce(rows));
  const forbidden=()=>{throw new Error('Global client access');};
  const prisma={$queryRaw:vi.fn(forbidden),$executeRaw:vi.fn(forbidden),$transaction:vi.fn(forbidden),
    withTenantContext:vi.fn((_society:string,run:(client:typeof tx)=>unknown)=>run(tx))};
  return {tx,prisma,controller:new GovernanceArtifactsController(prisma as never)};
}
const operations=[
  {name:'listDocuments',results:[[{id:'meeting'}],[]],run:(c:GovernanceArtifactsController)=>c.listDocuments('society','meeting')},
  {name:'addDocument',results:[[{id:'meeting'}],[{id:'document'}]],run:(c:GovernanceArtifactsController)=>c.addDocument('society','actor','meeting',documentInput)},
  {name:'verifyDocument',results:[[{id:'document',meetingId:'meeting',kind:'MINUTES'}]],run:(c:GovernanceArtifactsController)=>c.verifyDocument('society','actor','document',{})},
  {name:'listPolls',results:[],run:(c:GovernanceArtifactsController)=>c.listPolls('society')},
  {name:'getPoll',results:[[{id:'poll'}]],run:(c:GovernanceArtifactsController)=>c.getPoll('society','poll')},
  {name:'createPoll',results:[[{id:'meeting'}],[{id:'poll'}]],run:(c:GovernanceArtifactsController)=>c.createPoll('society','actor',pollInput)},
];
describe('governance artifact tenant transactions',()=>{
  it.each(operations)('uses one scoped client throughout $name',async({run,results})=>{
    const {controller,prisma}=fixture(results);
    await run(controller);
    expect(prisma.withTenantContext).toHaveBeenCalledExactlyOnceWith('society',expect.any(Function));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each(operations.filter(o=>o.name!=='listPolls'))('rejects foreign resources before $name reads children or writes evidence',async({run})=>{
    const {controller,tx}=fixture();
    await expect(run(controller)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.$queryRaw).toHaveBeenCalledOnce();expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect((tx.$queryRaw.mock.calls[0][0] as {values:unknown[]}).values).toContain('society');
  });
  it('rejects a document resolution belonging to another meeting',async()=>{
    const {controller,tx}=fixture([[{id:'meeting'}],[]]);
    await expect(controller.addDocument('society','actor','meeting',{...documentInput,resolutionId:'foreign'})).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect((tx.$queryRaw.mock.calls[1][0] as {values:unknown[]}).values).toEqual(['foreign','society','meeting']);
  });
  it.each(operations.filter(o=>['addDocument','verifyDocument'].includes(o.name)))('propagates audit failure inside $name transaction',async({run,results})=>{
    const {controller,tx,prisma}=fixture(results);
    tx.$executeRaw.mockRejectedValueOnce(new Error('Evidence unavailable'));
    await expect(run(controller)).rejects.toThrow('Evidence unavailable');
    expect(prisma.withTenantContext).toHaveBeenCalledOnce();expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });
  it('creates poll options on the parent-validation client and preserves the nonstatutory response',async()=>{
    const {controller,tx}=fixture([[{id:'meeting'}],[{id:'poll'}]]);
    expect(await controller.createPoll('society','actor',pollInput)).toEqual({id:'poll',pollType:'ADVISORY',title:'Budget',statutoryUseProhibited:true,options:[{ordinal:1,label:'Yes'},{ordinal:2,label:'No'}]});
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect((tx.$executeRaw.mock.calls[1][0] as {values:unknown[]}).values).toEqual(['poll',2,'No']);
  });
  it('propagates a later option failure from the poll transaction',async()=>{
    const {controller,tx,prisma}=fixture([[{id:'meeting'}],[{id:'poll'}]]);
    tx.$executeRaw.mockResolvedValueOnce(1).mockRejectedValueOnce(new Error('Option unavailable'));
    await expect(controller.createPoll('society','actor',pollInput)).rejects.toThrow('Option unavailable');
    expect(prisma.withTenantContext).toHaveBeenCalledOnce();expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });
  it.each([
    (c:GovernanceArtifactsController)=>c.addDocument('society',undefined,'meeting',documentInput),
    (c:GovernanceArtifactsController)=>c.verifyDocument('society',undefined,'document',{}),
    (c:GovernanceArtifactsController)=>c.createPoll('society',undefined,pollInput),
  ])('rejects missing actors before opening a database context',async run=>{
    const {controller,prisma}=fixture();
    await expect(run(controller)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
  });
  it('rejects invalid poll options and time ranges before opening a database context',async()=>{
    const {controller,prisma}=fixture();
    await expect(controller.createPoll('society','actor',{...pollInput,options:['Yes','YES']})).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.createPoll('society','actor',{...pollInput,opensAt:'2026-10-02',closesAt:'2026-10-01'})).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
  });
});
