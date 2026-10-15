import { describe, expect, it, vi } from 'vitest';
import { PaymentReconciliationService } from './payment-reconciliation.service';

describe('V4.25 reconciliation exception queue',()=>{
  it('derives a tenant-scoped accountant queue without mutating payment state',async()=>{
    const queryRaw=vi.fn().mockResolvedValue([{id:'case-1',status:'ACTION_REQUIRED',priority:'HIGH',nextAction:'Review provider failure evidence'}]);
    const executeRaw=vi.fn();
    const service=new PaymentReconciliationService({$queryRaw:queryRaw,$executeRaw:executeRaw} as never);
    const result=await service.listCases('society-a');
    expect(result).toEqual([expect.objectContaining({priority:'HIGH'})]);
    expect(executeRaw).not.toHaveBeenCalled();
    const sql=queryRaw.mock.calls[0][0] as {strings?:readonly string[];values?:unknown[]};
    const text=(sql.strings??[]).join('?');
    expect(text).toContain('ACTION_REQUIRED');
    expect(text).toContain('MISMATCH');
    expect(text).toContain('24 hours');
    expect(text).toContain('nextAction');
    expect(sql.values).toContain('society-a');
  });
});
