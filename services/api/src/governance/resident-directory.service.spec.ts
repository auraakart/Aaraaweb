import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { ResidentDirectoryService } from './resident-directory.service';

function fixture(){
  const tx={
    $queryRaw:vi.fn().mockResolvedValue([]),
    user:{findUnique:vi.fn().mockResolvedValue({name:' Resident '})},
  };
  const forbidden=()=>{throw new Error('Global client access');};
  const prisma={
    withTenantContext:vi.fn((_society:string,operation:(client:typeof tx)=>unknown)=>operation(tx)),
    $queryRaw:vi.fn(forbidden),$transaction:vi.fn(forbidden),user:{findUnique:vi.fn(forbidden)},
  };
  return {tx,prisma,service:new ResidentDirectoryService(prisma as never)};
}
const operations=[
  {name:'mine',run:(s:ResidentDirectoryService)=>s.mine('society-a','user-a')},
  {name:'updateMine',run:(s:ResidentDirectoryService)=>s.updateMine('society-a','user-a',{visible:false})},
  {name:'listVisible',run:(s:ResidentDirectoryService)=>s.listVisible('society-a','user-a')},
  {name:'contactRequests',run:(s:ResidentDirectoryService)=>s.contactRequests('society-a','user-a')},
  {name:'requestContact',run:(s:ResidentDirectoryService)=>s.requestContact('society-a','user-a','user-b')},
  {name:'respond',run:(s:ResidentDirectoryService)=>s.respond('society-a','user-a','request-a','ACCEPTED')},
  {name:'withdraw',run:(s:ResidentDirectoryService)=>s.withdraw('society-a','user-a','request-a')},
];

describe('Resident directory tenant transactions',()=>{
  it.each(operations)('rejects revoked resident authority before $name reads or writes',async({run})=>{
    const {service,tx,prisma}=fixture();
    tx.$queryRaw.mockResolvedValueOnce([{allowed:false}]);
    await expect(run(service)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-a',expect.any(Function));
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.user.findUnique).not.toHaveBeenCalled();
  });
  it('returns an unconfigured private profile using the scoped identity lookup',async()=>{
    const {service,tx,prisma}=fixture();
    tx.$queryRaw.mockResolvedValueOnce([{allowed:true}]).mockResolvedValueOnce([]);
    await expect(service.mine('society-a','user-a')).resolves.toMatchObject({displayName:'Resident',visible:false,configured:false});
    expect(tx.user.findUnique).toHaveBeenCalledWith({where:{id:'user-a'},select:{name:true}});
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
  it('keeps profile updates, normalization and identity lookup in one transaction',async()=>{
    const {service,tx,prisma}=fixture();
    tx.$queryRaw.mockResolvedValueOnce([{allowed:true}]).mockResolvedValueOnce([{visible:true,displayName:'Resident'}]);
    await expect(service.updateMine('society-a','user-a',{visible:true,interests:[' Games ','Games']})).resolves.toMatchObject({visible:true,displayName:'Resident'});
    expect(prisma.withTenantContext).toHaveBeenCalledOnce();
    expect(tx.$queryRaw.mock.calls[1][0].values).toContain('["Games"]');
    expect(tx.$queryRaw.mock.calls[1][0].values).toContain('society-a');
  });
  it.each(['listVisible','contactRequests'] as const)('keeps $name scoped without selecting contact details',async method=>{
    const {service,tx}=fixture();
    tx.$queryRaw.mockResolvedValueOnce([{allowed:true}]).mockResolvedValueOnce([]);
    await expect(service[method]('society-a','user-a')).resolves.toEqual([]);
    const sql=tx.$queryRaw.mock.calls[1][0];
    expect(sql.values).toContain('society-a');expect(sql.values).toContain('user-a');
    expect(sql.strings.join(' ')).not.toMatch(/"phone"|"email"|"unitId"/);
  });
  it('rejects hidden or foreign recipients inside the request transaction',async()=>{
    const {service,tx}=fixture();
    tx.$queryRaw.mockResolvedValueOnce([{allowed:true}]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{allowed:false,visible:false}]);
    await expect(service.requestContact('society-a','user-a','user-b')).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
  });
  it('retains pair locking and rejects reciprocal duplicate pending requests',async()=>{
    const {service,tx}=fixture();
    tx.$queryRaw.mockResolvedValueOnce([{allowed:true}]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{allowed:true,visible:true}]).mockResolvedValueOnce([{id:'pending'}]);
    await expect(service.requestContact('society-a','user-a','user-b')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.$queryRaw.mock.calls[1][0].values).toContain('resident-directory:society-a:user-a:user-b');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(4);
  });
  it('inserts an authorized request on the same client as resident/recipient checks',async()=>{
    const {service,tx,prisma}=fixture();
    tx.$queryRaw.mockResolvedValueOnce([{allowed:true}]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{allowed:true,visible:true}]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{id:'request-a',status:'PENDING'}]);
    await expect(service.requestContact('society-a','user-a','user-b',' Hello ')).resolves.toMatchObject({id:'request-a',status:'PENDING'});
    expect(prisma.withTenantContext).toHaveBeenCalledOnce();
    expect(tx.$queryRaw.mock.calls[4][0].values).toEqual(['society-a','user-a','user-b','Hello']);
  });
  it.each(['respond','withdraw'] as const)('rejects foreign, wrong-actor or already handled requests in %s',async method=>{
    const {service,tx}=fixture();
    tx.$queryRaw.mockResolvedValueOnce([{allowed:true}]).mockResolvedValueOnce([]);
    const result=method==='respond'?service.respond('society-a','user-a','request-a','ACCEPTED'):service.withdraw('society-a','user-a','request-a');
    await expect(result).rejects.toBeInstanceOf(NotFoundException);
    const sql=tx.$queryRaw.mock.calls[1][0];
    expect(sql.values).toContain('society-a');expect(sql.values).toContain('user-a');
    expect(sql.strings.join(' ')).toContain('"status"=\'PENDING\'');
    expect(sql.strings.join(' ')).toContain(method==='respond'?'"recipientUserId"':'"requesterUserId"');
  });
  it('rejects self-contact before opening a transaction',async()=>{
    const {service,prisma}=fixture();
    await expect(service.requestContact('society-a','user-a','user-a')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
  });
});
