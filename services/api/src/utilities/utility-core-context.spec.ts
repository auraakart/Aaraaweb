import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { UtilitiesService } from './utilities.service';
const society='society-a';
const meter={code:'meter-a',meterType:'WATER' as const};
const tariff={code:'tariff-a',name:'Water',meterType:'WATER' as const,effectiveFrom:'2099-01-01',slabs:[{fromUnit:0,ratePaisePerUnit:100}]};
function fixture() {
  const tx={ $queryRaw:vi.fn().mockResolvedValue([{id:'row-a'}]), $executeRaw:vi.fn().mockResolvedValue(1) };
  const withTenantContext=vi.fn(async (scope:string,run:(client:typeof tx)=>Promise<unknown>)=>{
    expect(scope).toBe(society);return run(tx);
  });
  const root=new Proxy({withTenantContext},{get(target,key){
    if(key==='withTenantContext')return target.withTenantContext;
    throw new Error('Root database access forbidden: '+String(key));
  }});
  return {service:new UtilitiesService(root as unknown as PrismaService),tx,withTenantContext};
}
describe('V5.14.1 utility core selected tenant transactions',()=>{
  it.each(['meters','readings','tariffs','tariffHistory','history'])('selects context for %s reads',async mode=>{
    const {service,tx,withTenantContext}=fixture();
    const result= mode==='meters'?await service.listMeters(society):mode==='readings'?await service.listReadings(society,'meter-a'):
      mode==='tariffs'?await service.listTariffPlans(society):mode==='tariffHistory'?await service.tariffHistory(society):await service.history(society);
    expect(result).toEqual([{id:'row-a'}]);expect(withTenantContext).toHaveBeenCalledOnce();
    const query=tx.$queryRaw.mock.calls[0][0] as {values:unknown[]};expect(query.values).toContain(society);
  });
  it.each(['createMeter','deactivateMeter','createReading','createTariff','activateTariff','retireTariff'])('keeps %s and its audit in one selected client',async mode=>{
    const {service,tx,withTenantContext}=fixture();
    if(mode==='createReading')tx.$queryRaw.mockResolvedValueOnce([{id:'row-a',active:true}]);
    if(mode==='activateTariff')tx.$queryRaw.mockResolvedValueOnce([{id:'row-a',status:'DRAFT',meterType:'WATER',effectiveFrom:new Date('2099-01-01'),effectiveTo:null}]).mockResolvedValueOnce([{count:1n}]).mockResolvedValueOnce([]);
    if(mode==='createMeter')await service.createMeter(society,'actor-a',meter);
    else if(mode==='deactivateMeter')await service.deactivateMeter(society,'actor-a','row-a');
    else if(mode==='createReading')await service.createReading(society,'actor-a',{meterId:'row-a',readingAt:'2099-01-01',value:0,readingKind:'RESET',note:'Replacement'});
    else if(mode==='createTariff')await service.createTariffPlan(society,'actor-a',tariff);
    else if(mode==='activateTariff')await service.activateTariffPlan(society,'actor-a','row-a');
    else await service.retireTariffPlan(society,'actor-a','row-a');
    expect(withTenantContext).toHaveBeenCalledOnce();expect(tx.$executeRaw).toHaveBeenCalled();
  });
  it('rejects foreign or inconsistent meter parents before inserting a meter or evidence',async()=>{
    const {service,tx}=fixture();tx.$queryRaw.mockResolvedValueOnce([{valid:false}]);
    await expect(service.createMeter(society,'actor-a',{...meter,unitId:'foreign-unit'})).rejects.toThrow('destination not found');
    expect(tx.$queryRaw).toHaveBeenCalledOnce();expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('validates optional parents and inserts the meter in the same context',async()=>{
    const {service,tx,withTenantContext}=fixture();tx.$queryRaw.mockResolvedValueOnce([{valid:true}]);
    await service.createMeter(society,'actor-a',{...meter,unitId:'unit-a',buildingId:'building-a'});
    expect(withTenantContext).toHaveBeenCalledOnce();expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });
  it('propagates audit failure without a root-client retry or success result',async()=>{
    const {service,tx,withTenantContext}=fixture();const failure=new Error('audit insert denied');tx.$executeRaw.mockRejectedValue(failure);
    await expect(service.createMeter(society,'actor-a',meter)).rejects.toBe(failure);
    expect(withTenantContext).toHaveBeenCalledOnce();
  });
});
