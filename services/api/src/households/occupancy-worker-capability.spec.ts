import { describe, expect, it, vi } from 'vitest';
import { OccupancyLifecycleService } from './occupancy-lifecycle.service';
import { OccupancyLifecycleRunner } from './occupancy-lifecycle.runner';

describe('Occupancy worker fixed discovery capability', () => {
  it('calls only the bounded capability and returns routing metadata', async () => {
    const query=vi.fn().mockResolvedValue([{id:'request',societyId:'society',reviewedByUserId:'reviewer'}]);
    const service=new OccupancyLifecycleService({$queryRaw:query} as never);
    expect(await service.dueApproved(20)).toEqual([{id:'request',societyId:'society',reviewedByUserId:'reviewer'}]);
    const sql=query.mock.calls[0][0];
    expect(sql.text).toContain('FROM aaraagate_due_occupancy_lifecycle(');
    expect(sql.text).not.toContain('OccupancyLifecycleRequest');
    expect(sql.values).toEqual([20]);
  });
  it.each([0,-1,51,1.5,NaN,Infinity])('rejects an invalid discovery limit %s before database access', limit=>{
    const query=vi.fn();const service=new OccupancyLifecycleService({$queryRaw:query} as never);
    expect(()=>service.dueApproved(limit)).toThrow('between 1 and 50');expect(query).not.toHaveBeenCalled();
  });
  it('routes completions to each discovered society and retains missing-reviewer and per-request recovery', async () => {
    const lifecycle={dueApproved:vi.fn().mockResolvedValue([
      {id:'missing',societyId:'A',reviewedByUserId:null},
      {id:'retry',societyId:'A',reviewedByUserId:'reviewer-A'},
      {id:'next',societyId:'B',reviewedByUserId:'reviewer-B'},
    ]),complete:vi.fn().mockRejectedValueOnce(new Error('Required move checklist is incomplete')).mockResolvedValueOnce({})};
    await new OccupancyLifecycleRunner(lifecycle as never).runOnce();
    expect(lifecycle.dueApproved).toHaveBeenCalledWith(50);
    expect(lifecycle.complete.mock.calls).toEqual([['A','reviewer-A','retry',true],['B','reviewer-B','next',true]]);
  });
});
