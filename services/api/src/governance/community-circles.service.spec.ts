import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { CommunityCirclesService } from './community-circles.service';

describe('CommunityCirclesService',()=>{
  it('keeps only the latest 100 posts while returning them oldest to newest for chat display',async()=>{
    const queryRaw=vi.fn()
      .mockResolvedValueOnce([{allowed:true}])
      .mockResolvedValueOnce([{id:'member-1'}])
      .mockResolvedValueOnce([]);
    const service=new CommunityCirclesService({withTenantContext:vi.fn((_society:string,callback:(tx:unknown)=>unknown)=>callback({$queryRaw:queryRaw}))} as never);

    await service.listPosts('society-1','user-1','circle-1');

    const sql=(queryRaw.mock.calls[2][0] as {strings:readonly string[]}).strings.join(' ');
    expect(sql).toContain('ORDER BY p."createdAt" DESC,p."id" DESC');
    expect(sql).toContain('LIMIT 100');
    expect(sql).toContain('ORDER BY recent."createdAt" ASC,recent."id" ASC');
  });
});

function fixture(results:unknown[]){
  const query=vi.fn();results.forEach(rows=>query.mockResolvedValueOnce(rows));
  const db={$queryRaw:query,$executeRaw:vi.fn().mockResolvedValue(1)};
  const forbidden=()=>{throw new Error('Global client access');};
  const prisma={$queryRaw:vi.fn(forbidden),$executeRaw:vi.fn(forbidden),
    withTenantContext:vi.fn((_society:string,callback:(tx:typeof db)=>unknown)=>callback(db)),
    $transaction:vi.fn(async(callback:(tx:typeof db)=>unknown)=>callback(db))};
  return {service:new CommunityCirclesService(prisma as never),db,prisma};
}
const active=[{id:'circle',status:'ACTIVE',expiresAt:null}],allowed=[{allowed:true}],member=[{id:'member'}];
const sql=(call:unknown[])=>(call[0] as {strings:readonly string[]}).strings.join(' ');

describe('circle publication, sender identity and moderation',()=>{
  it('creates resident requests as pending',async()=>{
    const {service,db}=fixture([allowed,[],[],[{status:'PENDING'}]]);
    expect(await service.request('society','user','Cricket')).toMatchObject({status:'PENDING'});
    expect((db.$queryRaw.mock.calls[3][0] as {values:unknown[]}).values).toContain('PENDING');
  });
  it('cannot bypass request approval with lifecycle changes',async()=>{
    const {service,db}=fixture([[{status:'PENDING'}]]);
    await expect(service.setStatus('society','circle','ACTIVE')).rejects.toThrow('Review a circle request');
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it('reviews pending requests only and records the reviewer',async()=>{
    const {service,db}=fixture([[{status:'PENDING'}],[{status:'ACTIVE'}]]);
    expect(await service.review('society','circle','admin','APPROVE','Suitable activity')).toMatchObject({status:'ACTIVE'});
    expect((db.$queryRaw.mock.calls[1][0] as {values:unknown[]}).values).toContain('admin');
    await expect(fixture([active]).service.review('society','circle','admin','REJECT','Already published')).rejects.toThrow('Only pending');
  });
  it('does not disclose messages or sender identity to nonmembers',async()=>{
    const {service,db}=fixture([allowed,[]]);
    await expect(service.listPosts('society','user','circle')).rejects.toThrow('Join this community circle');
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
    expect(sql(db.$queryRaw.mock.calls[1])).toContain('c."societyId"=m."societyId"');
  });
  it('requires a profile name and society flat before posting',async()=>{
    const {service,db}=fixture([active,allowed,member,[]]);
    await expect(service.createPost('society','user','circle','Hello')).rejects.toThrow('profile name and verified society flat');
    expect(db.$queryRaw).toHaveBeenCalledTimes(4);
  });
  it('snapshots only the server-resolved author and flat',async()=>{
    const identity={senderName:'Arun Kumar',senderFlat:'A · 204'};
    const {service,db}=fixture([active,allowed,member,[identity],[identity]]);
    expect(await service.createPost('society','user','circle','Hello')).toEqual(identity);
    expect(sql(db.$queryRaw.mock.calls[3])).toContain('un."societyId"=');
    expect((db.$queryRaw.mock.calls[4][0] as {values:unknown[]}).values).toContain(identity.senderFlat);
  });
  it('rejects posts after close or expiry',async()=>{
    await expect(fixture([[{status:'CLOSED'}]]).service.createPost('society','user','circle','Hello')).rejects.toThrow('read-only');
    await expect(fixture([[]]).service.createPost('society','user','circle','Hello')).rejects.toThrow('expired');
  });
  it('rejects a report for a message in another circle',async()=>{
    const {service,db}=fixture([active,allowed,member,[]]);
    await expect(service.report('society','user','circle','other-post','Spam content')).rejects.toThrow('message not found');
    expect(sql(db.$queryRaw.mock.calls[3])).toContain('p."circleId"=');
    expect(sql(db.$queryRaw.mock.calls[3])).toContain('p."societyId"=');
  });
  it('hides a post and resolves reports in one transaction',async()=>{
    const {service,db,prisma}=fixture([active,[{id:'post',hidden:true}]]);
    expect(await service.moderate('society','circle','post','admin',true,'Spam content')).toMatchObject({hidden:true});
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society',expect.any(Function));expect(prisma.$transaction).not.toHaveBeenCalled();expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    expect(sql(db.$queryRaw.mock.calls[1])).toContain('"moderatedByUserId"');
  });
});
describe('optional circle expiry',()=>{
  it('allows clearing an expiry date',async()=>{
    const {service,db}=fixture([active,[{expiresAt:null}]]);
    expect(await service.setExpiry('society','circle',null)).toEqual({expiresAt:null});
    expect((db.$queryRaw.mock.calls[1][0] as {values:unknown[]}).values[0]).toBeNull();
  });
  it('rejects past and invalid dates before querying',async()=>{
    const {service,db}=fixture([]);
    await expect(service.setExpiry('society','circle','2000-01-01T00:00:00Z')).rejects.toThrow('future date');
    await expect(service.setExpiry('society','circle','invalid')).rejects.toThrow('future date');
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
  it('deletes only due circles in bounded locked batches',async()=>{
    const {service,db}=fixture([[{id:'circle'}]]);
    expect(await service.deleteExpired()).toEqual({deleted:1});
    expect(sql(db.$queryRaw.mock.calls[0])).toContain('"expiresAt" IS NOT NULL');
    expect(sql(db.$queryRaw.mock.calls[0])).toContain('"expiresAt"<=CURRENT_TIMESTAMP');
    expect(sql(db.$queryRaw.mock.calls[0])).toContain('LIMIT 100 FOR UPDATE SKIP LOCKED');
  });
});


describe('community circle tenant boundaries',()=>{
  it.each([
    (s:CommunityCirclesService)=>s.listVisible('society','user'),
    (s:CommunityCirclesService)=>s.myRequests('society','user'),
    (s:CommunityCirclesService)=>s.request('society','user','Cricket'),
    (s:CommunityCirclesService)=>s.join('society','user','circle'),
    (s:CommunityCirclesService)=>s.leave('society','user','circle'),
    (s:CommunityCirclesService)=>s.listPosts('society','user','circle'),
  ])('rejects revoked residency before a resident operation touches circle data',async run=>{
    const {service,db,prisma}=fixture([[{allowed:false}]]);
    await expect(run(service)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society',expect.any(Function));
    expect(db.$queryRaw).toHaveBeenCalledOnce();expect(db.$executeRaw).not.toHaveBeenCalled();
  });
  it.each([
    (s:CommunityCirclesService)=>s.review('society','foreign','admin','APPROVE','Valid request'),
    (s:CommunityCirclesService)=>s.setStatus('society','foreign','CLOSED'),
    (s:CommunityCirclesService)=>s.setExpiry('society','foreign',null),
    (s:CommunityCirclesService)=>s.createPost('society','user','foreign','Hello'),
    (s:CommunityCirclesService)=>s.report('society','user','foreign','post','Spam content'),
    (s:CommunityCirclesService)=>s.moderate('society','foreign','post','admin',true,'Spam content'),
  ])('rejects foreign or expired circle parents before a child write',async run=>{
    const {service,db,prisma}=fixture([[]]);
    await expect(run(service)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society',expect.any(Function));
    expect(db.$queryRaw).toHaveBeenCalledOnce();expect(db.$executeRaw).not.toHaveBeenCalled();
  });
  it.each(['listManage','listReports'] as const)('scopes %s and its child projections',async method=>{
    const {service,db,prisma}=fixture([[]]);
    expect(await service[method]('society')).toEqual([]);
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society',expect.any(Function));
    expect((db.$queryRaw.mock.calls[0][0] as {values:unknown[]}).values).toContain('society');
  });
  it('retains the platform scheduler exception without opening tenant context',async()=>{
    const {service,prisma}=fixture([[]]);
    expect(await service.deleteExpired()).toEqual({deleted:0});
    expect(prisma.withTenantContext).not.toHaveBeenCalled();expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});
