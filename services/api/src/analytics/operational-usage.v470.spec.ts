import { describe,expect,it,vi } from 'vitest';
import { OperationalUsageService } from './operational-usage.service';

describe('V4.70 privacy-minimal task start signals',()=>{
  it('stores the new task-start signal with a pseudonymous hash and no raw user id',async()=>{
    const prisma={$executeRaw:vi.fn().mockResolvedValue(1)};
    const service=new OperationalUsageService(prisma as never);
    await service.record('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','PAYMENT_CHECKOUT_STARTED');
    const statement=prisma.$executeRaw.mock.calls[0][0] as {values?:readonly unknown[]};
    expect(statement.values).toContain('PAYMENT_CHECKOUT_STARTED');
    expect(statement.values).not.toContain('11111111-1111-4111-8111-111111111111');
    expect(statement.values?.some(value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value))).toBe(true);
  });
});
