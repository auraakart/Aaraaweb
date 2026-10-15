import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ProductFeature } from '../entitlements/entitlement.types';
import { REQUIRED_FEATURE_KEY } from '../entitlements/feature.decorator';
import { GovernancePollParticipationController } from './governance-poll-participation.controller';

const permissions=(method:keyof GovernancePollParticipationController)=>Reflect.getMetadata(PERMISSIONS_KEY,GovernancePollParticipationController.prototype[method] as object) as AppPermission[]|undefined;

describe('GovernancePollParticipationController permission boundaries',()=>{
  it('keeps community participation and closed results behind resident-readable society access',()=>{
    expect(permissions('listAvailable')).toEqual([AppPermission.NOTICE_READ]);
    expect(permissions('respond')).toEqual([AppPermission.NOTICE_READ]);
    expect(permissions('results')).toEqual([AppPermission.NOTICE_READ]);
  });
  it('keeps poll lifecycle management behind governance management',()=>{
    expect(permissions('setStatus')).toEqual([AppPermission.GOVERNANCE_MANAGE]);
  });
  it('requires the society GOVERNANCE_POLLS entitlement for every community-poll route',()=>{
    expect(Reflect.getMetadata(REQUIRED_FEATURE_KEY,GovernancePollParticipationController)).toBe(ProductFeature.GOVERNANCE_POLLS);
  });
});

const society='11111111-1111-4111-8111-111111111111';
const actor='22222222-2222-4222-8222-222222222222';
const pollId='33333333-3333-4333-8333-333333333333';
const optionId='44444444-4444-4444-8444-444444444444';
function fixture(){
  const query=vi.fn();
  const tx={$queryRaw:query};
  const context=vi.fn(async (_society:string, operation:(client:typeof tx)=>Promise<unknown>)=>operation(tx));
  const forbidden=vi.fn(()=>{throw new Error('Global database access is forbidden');});
  const prisma={withTenantContext:context,$queryRaw:forbidden,$transaction:forbidden};
  return {query,context,forbidden,controller:new GovernancePollParticipationController(prisma as unknown as PrismaService)};
}
const openPoll={id:pollId,status:'OPEN',opensAt:null,closesAt:null,statutoryUseProhibited:true};
describe('V5 community poll tenant transaction boundaries',()=>{
  it('lists available polls on the scoped client and retains society/audience predicates',async()=>{
    const f=fixture();f.query.mockResolvedValue([{id:pollId}]);
    await expect(f.controller.listAvailable(society,actor)).resolves.toEqual([{id:pollId}]);
    expect(f.context).toHaveBeenCalledWith(society,expect.any(Function));
    const sql=f.query.mock.calls[0][0];
    expect(sql.values).toContain(society);expect(sql.values).toContain(actor);
    expect(sql.text).toContain('"audienceScope"');expect(sql.text).toContain('"effectiveTo"');
    expect(f.forbidden).not.toHaveBeenCalled();
  });
  it('reads closed results and counts in the same tenant transaction',async()=>{
    const f=fixture();f.query.mockResolvedValueOnce([{...openPoll,status:'CLOSED'}]).mockResolvedValueOnce([{id:optionId,ordinal:1,label:'Yes',responseCount:2}]);
    await expect(f.controller.results(society,actor,pollId)).resolves.toMatchObject({pollId,totalResponses:2,statutoryUseProhibited:true});
    expect(f.context).toHaveBeenCalledTimes(1);expect(f.query).toHaveBeenCalledTimes(2);expect(f.forbidden).not.toHaveBeenCalled();
  });
  it('rejects an inaccessible poll before reading options',async()=>{
    const f=fixture();f.query.mockResolvedValue([]);
    await expect(f.controller.results(society,actor,pollId)).rejects.toBeInstanceOf(BadRequestException);
    expect(f.query).toHaveBeenCalledTimes(1);
  });
  it('keeps open results unavailable',async()=>{
    const f=fixture();f.query.mockResolvedValue([openPoll]);
    await expect(f.controller.results(society,actor,pollId)).rejects.toBeInstanceOf(ConflictException);
    expect(f.query).toHaveBeenCalledTimes(1);
  });
  it('records a response using the scoped client under the poll row lock',async()=>{
    const f=fixture();f.query.mockResolvedValueOnce([openPoll]).mockResolvedValueOnce([{id:optionId}]).mockResolvedValueOnce([]).mockResolvedValueOnce([{id:'response',optionId}]);
    await expect(f.controller.respond(society,actor,pollId,{optionId})).resolves.toMatchObject({optionId});
    expect(f.context).toHaveBeenCalledWith(society,expect.any(Function));
    expect(f.query.mock.calls[0][0].text).toContain('FOR UPDATE');expect(f.forbidden).not.toHaveBeenCalled();
  });
  it('rejects foreign options without writing a response',async()=>{
    const f=fixture();f.query.mockResolvedValueOnce([openPoll]).mockResolvedValueOnce([]);
    await expect(f.controller.respond(society,actor,pollId,{optionId})).rejects.toBeInstanceOf(BadRequestException);
    expect(f.query).toHaveBeenCalledTimes(2);
  });
  it('preserves duplicate response rejection',async()=>{
    const f=fixture();f.query.mockResolvedValueOnce([openPoll]).mockResolvedValueOnce([{id:optionId}]).mockResolvedValueOnce([{id:'existing'}]);
    await expect(f.controller.respond(society,actor,pollId,{optionId})).rejects.toBeInstanceOf(ConflictException);
    expect(f.query).toHaveBeenCalledTimes(3);
  });
  it('keeps statutory polls forbidden',async()=>{
    const f=fixture();f.query.mockResolvedValue([{...openPoll,statutoryUseProhibited:false}]);
    await expect(f.controller.respond(society,actor,pollId,{optionId})).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.query).toHaveBeenCalledTimes(1);
  });
  it('updates status in the scoped transaction',async()=>{
    const f=fixture();f.query.mockResolvedValueOnce([openPoll]).mockResolvedValueOnce([{id:pollId,status:'CLOSED'}]);
    await expect(f.controller.setStatus(society,pollId,{status:'CLOSED'})).resolves.toMatchObject({status:'CLOSED'});
    expect(f.context).toHaveBeenCalledWith(society,expect.any(Function));expect(f.forbidden).not.toHaveBeenCalled();
  });
  it('cannot manage a foreign poll',async()=>{
    const f=fixture();f.query.mockResolvedValue([]);
    await expect(f.controller.setStatus(society,pollId,{status:'CLOSED'})).rejects.toBeInstanceOf(BadRequestException);
    expect(f.query).toHaveBeenCalledTimes(1);
  });
  it('rejects missing actors before opening a transaction',()=>{
    const f=fixture();expect(()=>f.controller.listAvailable(society,undefined)).toThrow(BadRequestException);
    expect(f.context).not.toHaveBeenCalled();
  });
  it('propagates transaction failure without falling back to global access',async()=>{
    const f=fixture();f.context.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(f.controller.listAvailable(society,actor)).rejects.toThrow('database unavailable');
    expect(f.forbidden).not.toHaveBeenCalled();
  });
});
