import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingExportRunner } from './accounting-export.runner';
import { AccountingExportService } from './accounting-export.service';

describe('AccountingExportRunner',()=>{
  afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
  it('claims and executes queued work once per cycle',async()=>{
    const job={id:'job-1',societyId:'society-1',format:'CSV',fromDate:new Date('2026-04-01'),toDate:new Date('2026-04-02')};
    const query=vi.fn().mockResolvedValueOnce([job]).mockResolvedValueOnce([]);
    const prisma={$queryRaw:query} as unknown as PrismaService;
    const executeClaimed=vi.fn().mockResolvedValue(undefined);
    const service={executeClaimed} as unknown as AccountingExportService;
    const runner=new AccountingExportRunner(prisma,service);
    await runner.runOnce();
    expect(executeClaimed).toHaveBeenCalledTimes(1);
    expect(executeClaimed).toHaveBeenCalledWith(job);
    expect(query.mock.calls.map(([sql])=>sql.sql)).toEqual([expect.stringContaining('aaraagate_claim_accounting_export'),expect.stringContaining('aaraagate_claim_accounting_export')]);
  });
  it('fails closed on unavailable capabilities, sanitizes errors and resets the running guard',async()=>{
    const query=vi.fn().mockRejectedValueOnce(new Error('Bearer private-token artifact-content')).mockResolvedValue([]);
    const executeClaimed=vi.fn();
    const log=vi.spyOn(Logger.prototype,'error').mockImplementation(()=>undefined);
    const root=vi.fn(async()=>{throw new Error('Unrestricted fallback');});
    const runner=new AccountingExportRunner({$queryRaw:query,$transaction:root,$executeRaw:root} as never,{executeClaimed} as never);
    await runner.runOnce();await runner.runOnce();
    expect(log).toHaveBeenCalledWith('Accounting export cycle failed: Error');
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-token|artifact-content/);
    expect(query).toHaveBeenCalledTimes(2);expect(executeClaimed).not.toHaveBeenCalled();expect(root).not.toHaveBeenCalled();
  });

  it('does not overlap cycles and passes claimed fields unchanged',async()=>{
    let release!:(rows:unknown[])=>void;
    const waiting=new Promise<unknown[]>(resolve=>{release=resolve;});
    const query=vi.fn().mockReturnValueOnce(waiting).mockResolvedValue([]);
    const runner=new AccountingExportRunner({$queryRaw:query} as never,{executeClaimed:vi.fn()} as never);
    const first=runner.runOnce();await runner.runOnce();expect(query).toHaveBeenCalledOnce();release([]);await first;
  });

  it('clears its unreferenced periodic timer on shutdown',async()=>{
    vi.useFakeTimers();
    const query=vi.fn().mockResolvedValue([]);
    const runner=new AccountingExportRunner({$queryRaw:query} as never,{executeClaimed:vi.fn()} as never);
    runner.onModuleInit();await vi.advanceTimersByTimeAsync(60000);
    expect(query).toHaveBeenCalledTimes(2);runner.onModuleDestroy();await vi.advanceTimersByTimeAsync(120000);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
