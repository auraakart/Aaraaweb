import { BadRequestException,ConflictException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { GovernanceElectionBallotDraftController } from './governance-election-ballot-draft.controller';
const setup={snapshotId:'snapshot',snapshotCreatedByUserId:'snapshot-author',policyVersion:1};
const review={outcome:'REVIEWED',createdByUserId:'reviewer'};
const draft={id:'draft',snapshotId:'snapshot',createdByUserId:'draft-author',snapshotCreatedByUserId:'snapshot-author',policyCurrent:true};
const input={title:' Fixture ',question:' Choice? ',options:[' Yes ',' No ']};
function fixture(rows:unknown[]=[]){
  const tx={$queryRaw:vi.fn().mockResolvedValue([]),$executeRaw:vi.fn().mockResolvedValue(1)};rows.forEach(value=>tx.$queryRaw.mockResolvedValueOnce(value));
  const forbidden=()=>{throw new Error('Global database client used');};
  const prisma={$queryRaw:vi.fn(forbidden),$transaction:vi.fn(forbidden),withTenantContext:vi.fn((_id:string,run:(client:typeof tx)=>unknown)=>run(tx))};
  return {tx,prisma,controller:new GovernanceElectionBallotDraftController(prisma as never)};
}
describe('ballot evidence tenant transactions',()=>{
  const operations=[
    {name:'listReviews',rows:[],run:(c:GovernanceElectionBallotDraftController)=>c.listReviews('society','snapshot')},
    {name:'recordReview',rows:[[],[setup],[],[{id:'review',sequence:1}]],run:(c:GovernanceElectionBallotDraftController)=>c.recordReview('society','actor','snapshot',{outcome:'REVIEWED'})},
    {name:'listDrafts',rows:[[draft],[{ordinal:1,label:'Yes'}],[]],run:(c:GovernanceElectionBallotDraftController)=>c.listDrafts('society')},
    {name:'getDraft',rows:[[draft],[{ordinal:1,label:'Yes'}],[]],run:(c:GovernanceElectionBallotDraftController)=>c.getDraft('society','draft')},
    {name:'createDraft',rows:[[],[setup],[review],[draft]],run:(c:GovernanceElectionBallotDraftController)=>c.createDraft('society','actor','snapshot',input)},
    {name:'listDecisions',rows:[],run:(c:GovernanceElectionBallotDraftController)=>c.listDecisions('society','draft')},
    {name:'recordDecision',rows:[[],[draft],[],[review],[{id:'decision',sequence:1}]],run:(c:GovernanceElectionBallotDraftController)=>c.recordDecision('society','actor','draft',{outcome:'APPROVED'})},
  ];
  it.each(operations)('$name uses one client for parent and children',async({rows,run})=>{
    const f=fixture(rows);await run(f.controller);expect(f.prisma.withTenantContext).toHaveBeenCalledExactlyOnceWith('society',expect.any(Function));
  });
  it('rejects a foreign draft before reading options or decisions',async()=>{
    const f=fixture();await expect(f.controller.getDraft('society','foreign')).rejects.toBeInstanceOf(BadRequestException);expect(f.tx.$queryRaw).toHaveBeenCalledOnce();
  });
  it.each(['recordReview','createDraft'] as const)('%s rejects foreign/stale snapshots before mutation',async method=>{
    const f=fixture([[],[]]);await expect(method==='recordReview'?f.controller.recordReview('society','actor','foreign',{outcome:'REVIEWED'}):f.controller.createDraft('society','actor','foreign',input)).rejects.toBeInstanceOf(ConflictException);expect(f.tx.$queryRaw).toHaveBeenCalledTimes(2);expect(f.tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('rejects a foreign decision target before mutation',async()=>{
    const f=fixture([[],[]]);await expect(f.controller.recordDecision('society','actor','foreign',{outcome:'APPROVED'})).rejects.toBeInstanceOf(BadRequestException);expect(f.tx.$queryRaw).toHaveBeenCalledTimes(2);
  });
  it.each(['snapshot-author','reviewer'])('denies draft authorship by %s',async actor=>{
    const f=fixture([[],[setup],[review]]);await expect(f.controller.createDraft('society',actor,'snapshot',input)).rejects.toBeInstanceOf(ConflictException);expect(f.tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('denies electorate review by the snapshot creator',async()=>{
    const f=fixture([[],[setup]]);await expect(f.controller.recordReview('society','snapshot-author','snapshot',{outcome:'REVIEWED'})).rejects.toBeInstanceOf(ConflictException);
  });
  it.each(['snapshot-author','reviewer','draft-author'])('denies ballot approval by %s',async actor=>{
    const f=fixture([[],[draft],[],[review]]);await expect(f.controller.recordDecision('society',actor,'draft',{outcome:'APPROVED'})).rejects.toBeInstanceOf(ConflictException);expect(f.tx.$queryRaw).toHaveBeenCalledTimes(4);
  });
  it('propagates later option failure to roll back draft creation',async()=>{
    const f=fixture([[],[setup],[review],[draft]]);f.tx.$executeRaw.mockResolvedValueOnce(1).mockRejectedValueOnce(new Error('Option insertion failed'));
    await expect(f.controller.createDraft('society','actor','snapshot',input)).rejects.toThrow('Option insertion failed');
  });
  it('preserves terminal decisions',async()=>{
    const f=fixture([[],[draft],[{outcome:'CANCELLED',sequence:2}]]);await expect(f.controller.recordDecision('society','actor','draft',{outcome:'APPROVED'})).rejects.toBeInstanceOf(ConflictException);
  });
  it('allows cancellation of a stale policy-bound draft with a reason',async()=>{
    const f=fixture([[],[{...draft,policyCurrent:false}],[{outcome:'APPROVED',sequence:1}],[{outcome:'CANCELLED',sequence:2}]]);
    await expect(f.controller.recordDecision('society','actor','draft',{outcome:'CANCELLED',reason:'Stale policy'})).resolves.toMatchObject({sequence:2,executable:false,castingEnabled:false});
  });
  it('rejects invalid options and cancellation reasons before context creation',async()=>{
    const f=fixture();await expect(f.controller.createDraft('society','actor','snapshot',{...input,options:['Yes','YES']})).rejects.toBeInstanceOf(BadRequestException);await expect(f.controller.recordDecision('society','actor','draft',{outcome:'CANCELLED'})).rejects.toBeInstanceOf(BadRequestException);expect(f.prisma.withTenantContext).not.toHaveBeenCalled();
  });
});
