import { describe,expect,it,vi } from 'vitest';
import { OperationalUsageService } from './operational-usage.service';

function setup(){
  const prisma={$executeRaw:vi.fn().mockResolvedValue(1)};
  return {prisma,service:new OperationalUsageService(prisma as never)};
}

describe('V4.8 operational usage analytics',()=>{
  it('stores a pseudonymous subject hash rather than the raw user id',async()=>{
    const {prisma,service}=setup();
    await service.record(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'PROPERTY_CONTEXT_SWITCHED',
    );
    const statement=prisma.$executeRaw.mock.calls[0]?.[0] as {strings?:readonly string[];values?:readonly unknown[]};
    const values=statement.values??[];
    expect(values).toContain('22222222-2222-4222-8222-222222222222');
    expect(values).toContain('PROPERTY_CONTEXT_SWITCHED');
    expect(values).not.toContain('11111111-1111-4111-8111-111111111111');
    expect(values.some(value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value))).toBe(true);
  });

  it('records only aggregate guard sync counts',async()=>{
    const {prisma,service}=setup();
    await service.recordGuardSync('22222222-2222-4222-8222-222222222222',{
      considered:5,synced:4,retried:2,unresolved:1,reviewRequired:1,
    });
    const statement=prisma.$executeRaw.mock.calls[0]?.[0] as {strings?:readonly string[];values?:readonly unknown[]};
    expect((statement.strings??[]).join('?')).toContain('"GuardOfflineSyncMetric"');
    expect(statement.values).toEqual(expect.arrayContaining([5,4,2,1,1]));
  });
});
