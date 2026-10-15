import { BadRequestException,ConflictException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { GovernanceElectionProcedureController } from './governance-election-procedure.controller';
import { GovernanceElectionPrivacyController } from './governance-election-privacy.controller';
const procedure={jointOwnershipReference:'Policy',proxyReference:'Policy',voteBasisReference:'Policy',quorumReference:'Policy',secrecyReference:'Policy',challengeReference:'Policy',recountReference:'Policy',certificationReference:'Policy',resultPublicationReference:'Policy'};
const privacy={identitySeparationReference:'Policy',secrecyImplementationReference:'Policy',credentialIssuanceReference:'Policy',privilegedAuditAccessReference:'Policy',retentionReference:'Policy',incidentResponseReference:'Policy'};
const policy={id:'policy',version:1,enabled:true,createdByUserId:'author'};
function fixture(rows:unknown[]=[]){
  const tx={$queryRaw:vi.fn().mockResolvedValue([])};rows.forEach(value=>tx.$queryRaw.mockResolvedValueOnce(value));
  const forbidden=()=>{throw new Error('Global database client used');};
  const prisma={$queryRaw:vi.fn(forbidden),$transaction:vi.fn(forbidden),withTenantContext:vi.fn((_id:string,run:(client:typeof tx)=>unknown)=>run(tx))};
  return {tx,prisma,procedure:new GovernanceElectionProcedureController(prisma as never),privacy:new GovernanceElectionPrivacyController(prisma as never)};
}
describe('election procedure and privacy tenant transactions',()=>{
  it.each(['procedure','privacy'] as const)('%s current uses scoped reads and disabled execution flags',async name=>{
    const f=fixture([[{id:'evidence'}]]);await expect(f[name].current('society')).resolves.toMatchObject({id:'evidence',executionEnabled:false,castingEnabled:false});expect(f.prisma.withTenantContext).toHaveBeenCalledOnce();
  });
  it.each(['procedure','privacy'] as const)('%s rejects the latest disabled policy without selecting historical enabled evidence',async name=>{
    const f=fixture([[],[{...policy,enabled:false}]]);
    await expect(name==='procedure'?f.procedure.record('society','actor',procedure):f.privacy.record('society','actor',privacy)).rejects.toBeInstanceOf(ConflictException);
    expect(f.tx.$queryRaw).toHaveBeenCalledTimes(2);
    const sql=(f.tx.$queryRaw.mock.calls[1][0] as {sql:string}).sql;expect(sql).toContain('ORDER BY "version" DESC LIMIT 1');expect(sql).not.toContain('"enabled"=TRUE');
  });
  it('records procedure with existing version and separation rules',async()=>{
    const f=fixture([[],[policy],[{version:2}],[{id:'procedure',version:3}]]);
    await expect(f.procedure.record('society','actor',procedure)).resolves.toMatchObject({version:3,policyVersion:1,executionEnabled:false});expect(f.prisma.withTenantContext).toHaveBeenCalledOnce();
  });
  it('records privacy evidence on the same client as policy and procedure checks',async()=>{
    const f=fixture([[],[policy],[{id:'procedure',version:2,createdByUserId:'procedure-author'}],[],[{id:'privacy',version:1}]]);
    await expect(f.privacy.record('society','actor',privacy)).resolves.toMatchObject({architectureConfigured:true,policyVersion:1,procedureVersion:2,castingEnabled:false});expect(f.prisma.withTenantContext).toHaveBeenCalledOnce();
  });
  it('denies procedure authorship by the policy author',async()=>{
    const f=fixture([[],[policy]]);await expect(f.procedure.record('society','author',procedure)).rejects.toBeInstanceOf(ConflictException);expect(f.tx.$queryRaw).toHaveBeenCalledTimes(2);
  });
  it.each(['author','procedure-author'])('denies privacy authorship by %s',async actor=>{
    const f=fixture([[],[policy],[{id:'procedure',createdByUserId:'procedure-author'}]]);await expect(f.privacy.record('society',actor,privacy)).rejects.toBeInstanceOf(ConflictException);expect(f.tx.$queryRaw).toHaveBeenCalledTimes(3);
  });
  it('requires procedure evidence before privacy evidence',async()=>{
    const f=fixture([[],[policy],[]]);await expect(f.privacy.record('society','actor',privacy)).rejects.toBeInstanceOf(ConflictException);
  });
  it('rejects invalid references before context creation',async()=>{
    const f=fixture();await expect(f.procedure.record('society','actor',{...procedure,proxyReference:' '})).rejects.toBeInstanceOf(BadRequestException);await expect(f.privacy.record('society','actor',{...privacy,retentionReference:' '})).rejects.toBeInstanceOf(BadRequestException);expect(f.prisma.withTenantContext).not.toHaveBeenCalled();
  });
  it.each(['procedure','privacy'] as const)('%s preserves unconfigured reads',async name=>{
    const f=fixture();await expect(f[name].current('society')).resolves.toMatchObject({configured:false,executionEnabled:false,castingEnabled:false});
  });
});
