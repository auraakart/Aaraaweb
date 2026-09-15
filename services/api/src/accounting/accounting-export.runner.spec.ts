import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingExportRunner } from './accounting-export.runner';
import { AccountingExportService } from './accounting-export.service';

describe('AccountingExportRunner',()=>{
  it('claims and executes queued work once per cycle',async()=>{
    const job={id:'job-1',societyId:'society-1',format:'CSV',fromDate:new Date('2026-04-01'),toDate:new Date('2026-04-02')};
    const query=vi.fn().mockResolvedValueOnce([job]).mockResolvedValueOnce([]);
    const tx={$queryRaw:query};
    const prisma={$transaction:vi.fn((callback)=>(callback as (value:typeof tx)=>unknown)(tx))} as unknown as PrismaService;
    const executeClaimed=vi.fn().mockResolvedValue(undefined);
    const service={executeClaimed} as unknown as AccountingExportService;
    const runner=new AccountingExportRunner(prisma,service);
    await runner.runOnce();
    expect(executeClaimed).toHaveBeenCalledTimes(1);
    expect(executeClaimed).toHaveBeenCalledWith(job);
  });
});
