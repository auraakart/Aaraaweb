import { BadRequestException,ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { describe,expect,it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { GovernanceElectionFoundationController } from './governance-election-foundation.controller';
import { GovernanceElectionBallotDraftController } from './governance-election-ballot-draft.controller';
import { GovernanceElectionProcedureController } from './governance-election-procedure.controller';
import { GovernanceElectionPrivacyController } from './governance-election-privacy.controller';
import { GovernanceElectionHoldController } from './governance-election-hold.controller';
import { GovernanceElectionReadinessController } from './governance-election-readiness.controller';
const withDatabase=process.env.DATABASE_URL?describe:describe.skip;
withDatabase('V5 election holds/readiness on PostgreSQL',()=>{
  it('isolates holds/readiness, serializes duplicate holds, retains actor separation and blocks execution',async()=>{
    const prisma=new PrismaService(),foundation=new GovernanceElectionFoundationController(prisma),ballots=new GovernanceElectionBallotDraftController(prisma),hold=new GovernanceElectionHoldController(prisma),readiness=new GovernanceElectionReadinessController(prisma);
    const societyA=randomUUID(),societyB=randomUUID(),author=randomUUID(),snapshotAuthor=randomUUID(),reviewer=randomUUID(),draftAuthor=randomUUID();
    const policyInput={enabled:true,eligibilityMode:'VERIFIED_OWNERS' as const,policyReference:'Fixture'};
    try{
      await prisma.society.createMany({data:[{id:societyA,name:'Hold A',code:`hold-${societyA}`},{id:societyB,name:'Hold B',code:`hold-${societyB}`}]});
      await prisma.user.createMany({data:[author,snapshotAuthor,reviewer,draftAuthor].map(id=>({id,phone:`hold-${id}`}))});
      const drafts=[];
      for(const society of [societyA,societyB]){
        await foundation.recordPolicy(society,author,policyInput);
        const snapshot=await foundation.createSnapshot(society,snapshotAuthor);
        await ballots.recordReview(society,reviewer,snapshot.id,{outcome:'REVIEWED'});
        const draft=await ballots.createDraft(society,draftAuthor,snapshot.id,{title:'Fixture',question:'Choice?',options:['Yes','No']});drafts.push(draft.id);
      }
      const [draftA,draftB]=drafts;
      await expect(readiness.assess(societyA,draftB)).rejects.toBeInstanceOf(BadRequestException);
      await expect(hold.open(societyA,draftAuthor,draftB,{category:'LEGAL_POLICY',reason:'Fixture'})).rejects.toBeInstanceOf(BadRequestException);
      expect(await hold.list(societyA,draftB)).toEqual([]);
      const procedure=new GovernanceElectionProcedureController(prisma),privacy=new GovernanceElectionPrivacyController(prisma);
      await procedure.record(societyA,snapshotAuthor,{jointOwnershipReference:'Fixture',proxyReference:'Fixture',voteBasisReference:'Fixture',quorumReference:'Fixture',secrecyReference:'Fixture',challengeReference:'Fixture',recountReference:'Fixture',certificationReference:'Fixture',resultPublicationReference:'Fixture'});
      await privacy.record(societyA,reviewer,{identitySeparationReference:'Fixture',secrecyImplementationReference:'Fixture',credentialIssuanceReference:'Fixture',privilegedAuditAccessReference:'Fixture',retentionReference:'Fixture',incidentResponseReference:'Fixture'});
      await ballots.recordDecision(societyA,author,draftA,{outcome:'APPROVED'});
      await expect(readiness.assess(societyA,draftA)).resolves.toMatchObject({configurationReady:true,executionEnabled:false,castingEnabled:false});
      const attempts=await Promise.allSettled([hold.open(societyA,draftAuthor,draftA,{category:'LEGAL_POLICY',reason:'Fixture'}),hold.open(societyA,draftAuthor,draftA,{category:'LEGAL_POLICY',reason:'Fixture'})]);
      expect(attempts.filter(r=>r.status==='fulfilled')).toHaveLength(1);
      expect((attempts.find(r=>r.status==='rejected') as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
      await expect(readiness.assess(societyA,draftA)).resolves.toMatchObject({configurationReady:false,blockers:['ACTIVE_ELECTION_HOLD']});
      for(const method of ['resolve','cancel'] as const)await expect(hold[method](societyA,draftAuthor,draftA,{reason:'Fixture'})).rejects.toBeInstanceOf(ConflictException);
      await expect(hold.resolve(societyA,author,draftB,{reason:'Fixture'})).rejects.toBeInstanceOf(BadRequestException);
      const before=await hold.list(societyA,draftA);
      await expect(hold.resolve(societyA,author,draftA,{reason:'x'.repeat(2001)})).rejects.toThrow();
      expect(await hold.list(societyA,draftA)).toEqual(before);
      await expect(hold.resolve(societyA,author,draftA,{reason:'Resolved'})).resolves.toMatchObject({active:false,sequence:2});
      await expect(readiness.assess(societyA,draftA)).resolves.toMatchObject({configurationReady:true,executionEnabled:false,castingEnabled:false});
      await hold.open(societyA,draftAuthor,draftA,{category:'INCIDENT',reason:'New hold'});
      await expect(hold.cancel(societyA,author,draftA,{reason:'Cancelled'})).resolves.toMatchObject({active:false,sequence:4});
      expect(await hold.list(societyB,draftB)).toEqual([]);
      await foundation.recordPolicy(societyA,author,{...policyInput,enabled:false});
      expect((await readiness.assess(societyA,draftA)).blockers).toContain('CURRENT_ENABLED_POLICY_REQUIRED');
      await expect(prisma.$executeRaw(Prisma.sql`DELETE FROM "GovernanceElectionHoldEvent" WHERE "societyId"=${societyA}::uuid`)).rejects.toThrow();
    }finally{
      try{
        await prisma.$transaction(async tx=>{
          for(const table of ['GovernanceElectionHoldEvent','GovernanceElectionBallotDraftDecision','GovernanceElectionBallotDraftOption','GovernanceElectionBallotDraft','GovernanceElectorateReviewAttestation','GovernanceElectionPrivacyArchitectureRevision','GovernanceElectionProcedureRevision','GovernanceElectorateMember','GovernanceElectorateSnapshot','GovernanceElectionPolicyRevision']){
            await tx.$executeRaw(Prisma.sql`ALTER TABLE ${Prisma.raw(`"${table}"`)} DISABLE TRIGGER ${Prisma.raw(`"${table}_append_only_delete"`)}`);
            await tx.$executeRaw(Prisma.sql`DELETE FROM ${Prisma.raw(`"${table}"`)} WHERE "societyId" IN (${societyA}::uuid,${societyB}::uuid)`);
            await tx.$executeRaw(Prisma.sql`ALTER TABLE ${Prisma.raw(`"${table}"`)} ENABLE TRIGGER ${Prisma.raw(`"${table}_append_only_delete"`)}`);
          }
        });
        await prisma.society.deleteMany({where:{id:{in:[societyA,societyB]}}});await prisma.user.deleteMany({where:{id:{in:[author,snapshotAuthor,reviewer,draftAuthor]}}});
      }finally{await prisma.$disconnect();}
    }
  });
});
