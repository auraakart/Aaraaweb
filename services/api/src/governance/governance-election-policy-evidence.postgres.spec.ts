import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { describe,expect,it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { GovernanceElectionFoundationController } from './governance-election-foundation.controller';
import { GovernanceElectionProcedureController } from './governance-election-procedure.controller';
import { GovernanceElectionPrivacyController } from './governance-election-privacy.controller';
const withDatabase=process.env.DATABASE_URL?describe:describe.skip;
withDatabase('V5 election procedure/privacy policy evidence on PostgreSQL',()=>{
  it('isolates evidence, enforces actor separation and latest-policy disable, and serializes evidence versions',async()=>{
    const prisma=new PrismaService(),foundation=new GovernanceElectionFoundationController(prisma),procedure=new GovernanceElectionProcedureController(prisma),privacy=new GovernanceElectionPrivacyController(prisma);
    const societyA=randomUUID(),societyB=randomUUID(),author=randomUUID(),procedureAuthor=randomUUID(),privacyAuthor=randomUUID();
    const procedureInput={jointOwnershipReference:'Fixture',proxyReference:'Fixture',voteBasisReference:'Fixture',quorumReference:'Fixture',secrecyReference:'Fixture',challengeReference:'Fixture',recountReference:'Fixture',certificationReference:'Fixture',resultPublicationReference:'Fixture'};
    const privacyInput={identitySeparationReference:'Fixture',secrecyImplementationReference:'Fixture',credentialIssuanceReference:'Fixture',privilegedAuditAccessReference:'Fixture',retentionReference:'Fixture',incidentResponseReference:'Fixture'};
    const policyInput={enabled:true,eligibilityMode:'VERIFIED_OWNERS' as const,policyReference:'Fixture bye-laws'};
    try{
      await prisma.society.createMany({data:[{id:societyA,name:'Policy evidence A',code:`ev-${societyA}`},{id:societyB,name:'Policy evidence B',code:`ev-${societyB}`}]});
      await prisma.user.createMany({data:[author,procedureAuthor,privacyAuthor].map(id=>({id,phone:`ev-${id}`}))});
      const policyA=await foundation.recordPolicy(societyA,author,policyInput);
      await expect(procedure.record(societyB,procedureAuthor,procedureInput)).rejects.toBeInstanceOf(ConflictException);
      await expect(privacy.record(societyB,privacyAuthor,privacyInput)).rejects.toBeInstanceOf(ConflictException);
      await expect(procedure.record(societyA,author,procedureInput)).rejects.toBeInstanceOf(ConflictException);
      await expect(privacy.record(societyA,privacyAuthor,privacyInput)).rejects.toBeInstanceOf(ConflictException);
      const recordedProcedure=await procedure.record(societyA,procedureAuthor,procedureInput);
      for(const actor of [author,procedureAuthor])await expect(privacy.record(societyA,actor,privacyInput)).rejects.toBeInstanceOf(ConflictException);
      const recordedPrivacy=await privacy.record(societyA,privacyAuthor,privacyInput);
      expect(recordedProcedure).toMatchObject({policyRevisionId:policyA.id,executionEnabled:false,castingEnabled:false});
      expect(recordedPrivacy).toMatchObject({policyRevisionId:policyA.id,architectureConfigured:true,executionEnabled:false,castingEnabled:false});
      expect(await procedure.current(societyB)).toMatchObject({configured:false});expect(await privacy.current(societyB)).toMatchObject({configured:false});
      const procedureVersions=await Promise.all([procedure.record(societyA,procedureAuthor,procedureInput),procedure.record(societyA,procedureAuthor,procedureInput)]);
      expect(procedureVersions.map(r=>r.version).sort()).toEqual([2,3]);
      const privacyVersions=await Promise.all([privacy.record(societyA,privacyAuthor,privacyInput),privacy.record(societyA,privacyAuthor,privacyInput)]);
      expect(privacyVersions.map(r=>r.version).sort()).toEqual([2,3]);
      const before=await privacy.current(societyA);
      await expect(privacy.record(societyA,privacyAuthor,{...privacyInput,retentionReference:'x'.repeat(2001)})).rejects.toThrow();
      expect(await privacy.current(societyA)).toEqual(before);
      await foundation.recordPolicy(societyA,author,{...policyInput,enabled:false});
      // An older enabled revision remains: neither write may select it after the latest revision disables elections.
      await expect(procedure.record(societyA,procedureAuthor,procedureInput)).rejects.toBeInstanceOf(ConflictException);
      await expect(privacy.record(societyA,privacyAuthor,privacyInput)).rejects.toBeInstanceOf(ConflictException);
      expect(await procedure.current(societyA)).toMatchObject({configured:false});expect(await privacy.current(societyA)).toMatchObject({configured:false});
      await expect(prisma.$executeRaw(Prisma.sql`DELETE FROM "GovernanceElectionProcedureRevision" WHERE "id"=${recordedProcedure.id}::uuid`)).rejects.toThrow();
      await expect(prisma.$executeRaw(Prisma.sql`DELETE FROM "GovernanceElectionPrivacyArchitectureRevision" WHERE "id"=${recordedPrivacy.id}::uuid`)).rejects.toThrow();
      const newPolicy=await foundation.recordPolicy(societyA,author,policyInput);
      expect(await procedure.current(societyA)).toMatchObject({configured:false});
      await procedure.record(societyA,procedureAuthor,procedureInput);
      expect(await privacy.current(societyA)).toMatchObject({configured:false});
      await expect(privacy.record(societyA,privacyAuthor,privacyInput)).resolves.toMatchObject({policyRevisionId:newPolicy.id,version:1});
    }finally{
      try{
        await prisma.$transaction(async tx=>{
          for(const table of ['GovernanceElectionPrivacyArchitectureRevision','GovernanceElectionProcedureRevision','GovernanceElectionPolicyRevision']){
            await tx.$executeRaw(Prisma.sql`ALTER TABLE ${Prisma.raw(`"${table}"`)} DISABLE TRIGGER ${Prisma.raw(`"${table}_append_only_delete"`)}`);
            await tx.$executeRaw(Prisma.sql`DELETE FROM ${Prisma.raw(`"${table}"`)} WHERE "societyId" IN (${societyA}::uuid,${societyB}::uuid)`);
            await tx.$executeRaw(Prisma.sql`ALTER TABLE ${Prisma.raw(`"${table}"`)} ENABLE TRIGGER ${Prisma.raw(`"${table}_append_only_delete"`)}`);
          }
        });
        await prisma.society.deleteMany({where:{id:{in:[societyA,societyB]}}});await prisma.user.deleteMany({where:{id:{in:[author,procedureAuthor,privacyAuthor]}}});
      }finally{await prisma.$disconnect();}
    }
  });
});
