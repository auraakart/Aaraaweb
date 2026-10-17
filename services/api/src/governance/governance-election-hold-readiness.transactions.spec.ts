import { BadRequestException,ConflictException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { GovernanceElectionHoldController } from './governance-election-hold.controller';
import { GovernanceElectionReadinessController } from './governance-election-readiness.controller';
function fixture(rows:unknown[]=[]){
  const tx={$queryRaw:vi.fn().mockResolvedValue([])};rows.forEach(value=>tx.$queryRaw.mockResolvedValueOnce(value));
  const forbidden=()=>{throw new Error('Global database client used');};
  const prisma={$queryRaw:vi.fn(forbidden),$transaction:vi.fn(forbidden),withTenantContext:vi.fn((_id:string,run:(client:typeof tx)=>unknown)=>run(tx))};
  return {tx,prisma,hold:new GovernanceElectionHoldController(prisma as never),readiness:new GovernanceElectionReadinessController(prisma as never)};
}
const active={sequence:1,action:'OPEN_HOLD',category:'LEGAL_POLICY',createdByUserId:'author'};
describe('election hold and readiness tenant transactions',()=>{
  it('lists holds in scoped context',async()=>{const f=fixture();await expect(f.hold.list('society','ballot')).resolves.toEqual([]);expect(f.prisma.withTenantContext).toHaveBeenCalledOnce();});
  it('opens a hold using one scoped client',async()=>{
    const f=fixture([[],[{id:'ballot'}],[],[{id:'hold',sequence:1}]]);
    await expect(f.hold.open('society','author','ballot',{category:'LEGAL_POLICY',reason:' Fixture '})).resolves.toMatchObject({active:true,executionEnabled:false,castingEnabled:false});expect(f.prisma.withTenantContext).toHaveBeenCalledOnce();
  });
  it.each(['resolve','cancel'] as const)('%s retains the different-author close rule',async method=>{
    const f=fixture([[],[{id:'ballot'}],[active],[{id:'hold',sequence:2}]]);
    await expect(f.hold[method]('society','reviewer','ballot',{reason:'Fixture'})).resolves.toMatchObject({active:false,sequence:2});expect(f.prisma.withTenantContext).toHaveBeenCalledOnce();
  });
  it.each(['open','resolve','cancel'] as const)('%s rejects foreign ballots before mutation',async method=>{
    const f=fixture([[],[]]);await expect(f.hold[method]('society','actor','foreign',{category:'LEGAL_POLICY',reason:'Fixture'})).rejects.toBeInstanceOf(BadRequestException);expect(f.tx.$queryRaw).toHaveBeenCalledTimes(2);
  });
  it.each(['resolve','cancel'] as const)('%s denies the hold author',async method=>{
    const f=fixture([[],[{id:'ballot'}],[active]]);await expect(f.hold[method]('society','author','ballot',{reason:'Fixture'})).rejects.toBeInstanceOf(ConflictException);expect(f.tx.$queryRaw).toHaveBeenCalledTimes(3);
  });
  it('rejects duplicate active holds',async()=>{
    const f=fixture([[],[{id:'ballot'}],[active]]);await expect(f.hold.open('society','actor','ballot',{category:'LEGAL_POLICY',reason:'Fixture'})).rejects.toBeInstanceOf(ConflictException);
  });
  it('readiness rejects foreign ballots before aggregating evidence',async()=>{
    const f=fixture();await expect(f.readiness.assess('society','foreign')).rejects.toBeInstanceOf(BadRequestException);expect(f.prisma.withTenantContext).toHaveBeenCalledOnce();
  });
  it('preserves successful configuration readiness without enabling execution',async()=>{
    const f=fixture([[{ballotDraftId:'ballot',policyEnabled:true,policyCurrent:true,reviewOutcome:'REVIEWED',procedureRevisionId:'procedure',privacyArchitectureRevisionId:'privacy',decisionOutcome:'APPROVED',holdAction:'RESOLVE_HOLD'}]]);
    await expect(f.readiness.assess('society','ballot')).resolves.toMatchObject({configurationReady:true,blockers:[],executionEnabled:false,castingEnabled:false});
  });
});
