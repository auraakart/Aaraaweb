import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { GovernanceService } from './governance.service';

const at=new Date('2026-10-01T00:00:00Z');
const meetingInput={meetingType:'COMMITTEE' as const,title:' Monthly meeting ',scheduledAt:at};
const resolutionInput={title:'Budget',resolutionText:'Approve budget',status:'PASSED' as const};
function fixture(results:unknown[]=[]){
  const tx={$queryRaw:vi.fn().mockResolvedValue([]),$executeRaw:vi.fn().mockResolvedValue(1)};
  results.forEach(rows=>tx.$queryRaw.mockResolvedValueOnce(rows));
  const forbidden=()=>{throw new Error('Global client access');};
  const prisma={$queryRaw:vi.fn(forbidden),$executeRaw:vi.fn(forbidden),$transaction:vi.fn(forbidden),
    withTenantContext:vi.fn((_society:string,run:(client:typeof tx)=>unknown)=>run(tx))};
  return {tx,prisma,service:new GovernanceService(prisma as never)};
}
const operations=[
  {name:'listCommittee',results:[],run:(s:GovernanceService)=>s.listCommittee('society')},
  {name:'listMeetings',results:[],run:(s:GovernanceService)=>s.listMeetings('society')},
  {name:'getMeeting',results:[[{id:'meeting'}]],run:(s:GovernanceService)=>s.getMeeting('society','meeting')},
  {name:'createTenure',results:[[],[{id:'user'}],[],[{id:'tenure'}]],run:(s:GovernanceService)=>s.createTenure('society','actor',{userId:'user',roleName:'Secretary',effectiveFrom:at})},
  {name:'endTenure',results:[[{effectiveFrom:at,effectiveTo:null}],[{id:'tenure'}]],run:(s:GovernanceService)=>s.endTenure('society','actor','tenure',at)},
  {name:'createMeeting',results:[[{id:'meeting'}],[{id:'meeting'}]],run:(s:GovernanceService)=>s.createMeeting('society','actor',meetingInput)},
  {name:'recordMeetingOutcome',results:[[{id:'meeting'}],[{id:'meeting'}]],run:(s:GovernanceService)=>s.recordMeetingOutcome('society','actor','meeting',{status:'HELD'})},
  {name:'addAgenda',results:[[{id:'meeting'}],[{id:'agenda'}]],run:(s:GovernanceService)=>s.addAgenda('society','actor','meeting',{ordinal:1,title:'Budget'})},
  {name:'addResolution',results:[[{id:'meeting'}],[{id:'resolution'}]],run:(s:GovernanceService)=>s.addResolution('society','actor','meeting',resolutionInput)},
  {name:'addAction',results:[[{id:'meeting'}],[{id:'action'}]],run:(s:GovernanceService)=>s.addAction('society','actor','meeting',{title:'Prepare minutes'})},
  {name:'updateAction',results:[[{id:'action',title:'Minutes',status:'OPEN',ownerUserId:null,dueAt:null}],[{id:'action'}]],run:(s:GovernanceService)=>s.updateAction('society','actor','meeting','action',{status:'COMPLETED'})},
];

describe('governance core tenant transactions',()=>{
  it.each(operations)('uses one scoped client throughout $name',async({run,results})=>{
    const {service,prisma}=fixture(results);
    await run(service);
    expect(prisma.withTenantContext).toHaveBeenCalledExactlyOnceWith('society',expect.any(Function));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each(operations.filter(o=>['getMeeting','endTenure','recordMeetingOutcome','addAgenda','addResolution','addAction','updateAction'].includes(o.name)))('rejects foreign resources before $name writes evidence',async({run})=>{
    const {service,tx}=fixture();
    await expect(run(service)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.$queryRaw).toHaveBeenCalledOnce();expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect((tx.$queryRaw.mock.calls[0][0] as {values:unknown[]}).values).toContain('society');
  });
  it('returns the same meeting aggregate under a single context',async()=>{
    const {service,tx}=fixture([[{id:'meeting',title:'Monthly'}],[{id:'agenda'}],[{id:'resolution'}],[{id:'action'}],[{id:'evidence'}]]);
    expect(await service.getMeeting('society','meeting')).toEqual({id:'meeting',title:'Monthly',agenda:[{id:'agenda'}],resolutions:[{id:'resolution'}],actions:[{id:'action'}],evidence:[{id:'evidence'}]});
    for(const [query] of tx.$queryRaw.mock.calls)expect((query as {values:unknown[]}).values).toEqual(expect.arrayContaining(['society','meeting']));
  });
  it.each(operations.filter(o=>['createMeeting','recordMeetingOutcome','addAgenda','addResolution','addAction','updateAction'].includes(o.name)))('propagates evidence failure from the same transaction in $name',async({run,results})=>{
    const {service,tx,prisma}=fixture(results);
    tx.$executeRaw.mockRejectedValueOnce(new Error('Evidence unavailable'));
    await expect(run(service)).rejects.toThrow('Evidence unavailable');
    expect(prisma.withTenantContext).toHaveBeenCalledOnce();
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });
  it('rejects an agenda from another meeting before resolution insertion',async()=>{
    const {service,tx}=fixture([[{id:'meeting'}],[]]);
    await expect(service.addResolution('society','actor','meeting',{...resolutionInput,agendaItemId:'foreign'})).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect((tx.$queryRaw.mock.calls[1][0] as {values:unknown[]}).values).toEqual(['foreign','society','meeting']);
  });
  it('rejects a resolution from another meeting before action insertion',async()=>{
    const {service,tx}=fixture([[{id:'meeting'}],[]]);
    await expect(service.addAction('society','actor','meeting',{title:'Minutes',resolutionId:'foreign'})).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('locks the society/member namespace before checking even an empty tenure history',async()=>{
    const {service,tx}=fixture([[],[{id:'user'}],[{id:'overlap'}]]);
    await expect(service.createTenure('society','actor',{userId:'user',roleName:'Secretary',effectiveFrom:at})).rejects.toBeInstanceOf(ConflictException);
    expect((tx.$queryRaw.mock.calls[0][0] as {values:unknown[]}).values).toEqual(['governance-tenure:society:user']);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
  });
  it('retains action row locking and completion evidence metadata',async()=>{
    const {service,tx}=fixture(operations.find(o=>o.name==='updateAction')!.results);
    await service.updateAction('society','actor','meeting','action',{status:'COMPLETED'});
    expect((tx.$queryRaw.mock.calls[0][0] as {strings:readonly string[]}).strings.join(' ')).toContain('FOR UPDATE');
    expect((tx.$executeRaw.mock.calls[0][0] as {values:unknown[]}).values).toContain(JSON.stringify({actionId:'action',status:'COMPLETED',ownerUserId:null,dueAt:null}));
  });
});
