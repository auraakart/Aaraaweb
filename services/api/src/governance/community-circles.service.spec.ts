import { describe,expect,it,vi } from 'vitest';
import { CommunityCirclesService } from './community-circles.service';

describe('CommunityCirclesService',()=>{
  it('keeps only the latest 100 posts while returning them oldest to newest for chat display',async()=>{
    const queryRaw=vi.fn()
      .mockResolvedValueOnce([{allowed:true}])
      .mockResolvedValueOnce([{id:'member-1'}])
      .mockResolvedValueOnce([]);
    const service=new CommunityCirclesService({$queryRaw:queryRaw} as never);

    await service.listPosts('society-1','user-1','circle-1');

    const sql=(queryRaw.mock.calls[2][0] as {strings:readonly string[]}).strings.join(' ');
    expect(sql).toContain('ORDER BY p."createdAt" DESC,p."id" DESC');
    expect(sql).toContain('LIMIT 100');
    expect(sql).toContain('ORDER BY recent."createdAt" ASC,recent."id" ASC');
  });
});
