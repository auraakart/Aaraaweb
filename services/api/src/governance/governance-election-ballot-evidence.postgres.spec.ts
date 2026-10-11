import { BadRequestException,ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { describe,expect,it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { GovernanceElectionFoundationController } from './governance-election-foundation.controller';
import { GovernanceElectionBallotDraftController } from './governance-election-ballot-draft.controller';

const withDatabase=process.env.DATABASE_URL?describe:describe.skip;
withDatabase('V5 ballot evidence on PostgreSQL',()=>{
  it('isolates parent/child evidence, serializes review and decision sequences, and rolls back incomplete drafts',async()=>{
    const prisma=new PrismaService(),foundation=new GovernanceElectionFoundationController(prisma),ballots=new GovernanceElectionBallotDraftController(prisma);
    const societyA=randomUUID(),societyB=randomUUID(),policyAuthor=randomUUID(),snapshotAuthor=randomUUID(),reviewer=randomUUID(),draftAuthor=randomUUID();
    const policyInput={enabled:true,eligibilityMode:'VERIFIED_OWNERS' as const,policyReference:'Fixture'};
    const input={title:'Fixture',question:'Choice?',options:['Yes','No']};
    try{
      await prisma.society.createMany({data:[{id:societyA,name:'Ballot A',code:`ballot-${societyA}`},{id:societyB,name:'Ballot B',code:`ballot-${societyB}`}]});
      await prisma.user.createMany({data:[policyAuthor,snapshotAuthor,reviewer,draftAuthor].map(id=>({id,phone:`ballot-${id}`}))});
      const snapshots=[];
      for(const society of [societyA,societyB]){
        await foundation.recordPolicy(society,policyAuthor,policyInput);
        snapshots.push((await foundation.createSnapshot(society,snapshotAuthor)).id);
      }
      const [snapshotA,snapshotB]=snapshots;
      await expect(ballots.recordReview(societyA,reviewer,snapshotB,{outcome:'REVIEWED'})).rejects.toBeInstanceOf(ConflictException);
      await expect(ballots.createDraft(societyA,draftAuthor,snapshotB,input)).rejects.toBeInstanceOf(ConflictException);
      expect(await ballots.listReviews(societyA,snapshotB)).toEqual([]);
      await expect(ballots.recordReview(societyA,snapshotAuthor,snapshotA,{outcome:'REVIEWED'})).rejects.toBeInstanceOf(ConflictException);
      await expect(ballots.createDraft(societyA,draftAuthor,snapshotA,input)).rejects.toBeInstanceOf(ConflictException);
      const reviews=await Promise.all([ballots.recordReview(societyA,reviewer,snapshotA,{outcome:'REVIEWED'}),ballots.recordReview(societyA,reviewer,snapshotA,{outcome:'REVIEWED'})]);
      expect(reviews.map(r=>r.sequence).sort()).toEqual([1,2]);
      await ballots.recordReview(societyB,reviewer,snapshotB,{outcome:'REVIEWED'});
      const draftB=await ballots.createDraft(societyB,draftAuthor,snapshotB,input);
      await expect(ballots.getDraft(societyA,draftB.id)).rejects.toBeInstanceOf(BadRequestException);
      await expect(ballots.recordDecision(societyA,policyAuthor,draftB.id,{outcome:'APPROVED'})).rejects.toBeInstanceOf(BadRequestException);
      expect(await ballots.listDecisions(societyA,draftB.id)).toEqual([]);
      for(const actor of [snapshotAuthor,reviewer])await expect(ballots.createDraft(societyA,actor,snapshotA,input)).rejects.toBeInstanceOf(ConflictException);
      // The second option exceeds the database column limit after the draft and first option were inserted.
      await expect(ballots.createDraft(societyA,draftAuthor,snapshotA,{...input,options:['Valid','x'.repeat(501)]})).rejects.toThrow();
      expect(await ballots.listDrafts(societyA)).toEqual([]);
      const optionCount=await prisma.$queryRaw<Array<{count:number}>>(Prisma.sql`SELECT count(*)::int AS "count" FROM "GovernanceElectionBallotDraftOption" WHERE "societyId"=${societyA}::uuid`);
      expect(optionCount[0].count).toBe(0);
      const draftA=await ballots.createDraft(societyA,draftAuthor,snapshotA,input);
      for(const actor of [snapshotAuthor,reviewer,draftAuthor])await expect(ballots.recordDecision(societyA,actor,draftA.id,{outcome:'APPROVED'})).rejects.toBeInstanceOf(ConflictException);
      const decisions=await Promise.allSettled([ballots.recordDecision(societyA,policyAuthor,draftA.id,{outcome:'APPROVED'}),ballots.recordDecision(societyA,policyAuthor,draftA.id,{outcome:'APPROVED'})]);
      expect(decisions.filter(r=>r.status==='fulfilled')).toHaveLength(1);
      expect((decisions.find(r=>r.status==='rejected') as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
      const expected={id:draftA.id,options:[{ordinal:1,label:'Yes'},{ordinal:2,label:'No'}],latestDecision:{outcome:'APPROVED',sequence:1},executable:false,castingEnabled:false};
      await expect(ballots.getDraft(societyA,draftA.id)).resolves.toMatchObject(expected);
      expect(await ballots.listDrafts(societyA)).toHaveLength(1);
      expect((await ballots.listDrafts(societyA))[0]).toMatchObject(expected);
      await ballots.recordReview(societyA,reviewer,snapshotA,{outcome:'BLOCKED'});
      await expect(ballots.createDraft(societyA,draftAuthor,snapshotA,input)).rejects.toBeInstanceOf(ConflictException);
      await ballots.recordReview(societyA,reviewer,snapshotA,{outcome:'REVIEWED'});
      const undecided=await ballots.createDraft(societyA,draftAuthor,snapshotA,input);
      await foundation.recordPolicy(societyA,policyAuthor,{...policyInput,enabled:false});
      await expect(ballots.recordReview(societyA,reviewer,snapshotA,{outcome:'REVIEWED'})).rejects.toBeInstanceOf(ConflictException);
      await expect(ballots.createDraft(societyA,draftAuthor,snapshotA,input)).rejects.toBeInstanceOf(ConflictException);
      await expect(ballots.recordDecision(societyA,policyAuthor,undecided.id,{outcome:'APPROVED'})).rejects.toBeInstanceOf(ConflictException);
      expect(await ballots.listDecisions(societyA,undecided.id)).toEqual([]);
      const history=await ballots.listDecisions(societyA,draftA.id);
      await expect(ballots.recordDecision(societyA,policyAuthor,draftA.id,{outcome:'CANCELLED',reason:'x'.repeat(2001)})).rejects.toThrow();
      expect(await ballots.listDecisions(societyA,draftA.id)).toEqual(history);
      await expect(ballots.recordDecision(societyA,policyAuthor,draftA.id,{outcome:'CANCELLED',reason:'Policy disabled'})).resolves.toMatchObject({outcome:'CANCELLED',sequence:2,executable:false,castingEnabled:false});
      await expect(ballots.recordDecision(societyA,policyAuthor,draftA.id,{outcome:'APPROVED'})).rejects.toBeInstanceOf(ConflictException);
      expect(await ballots.listDecisions(societyB,draftB.id)).toEqual([]);
      await expect(prisma.$executeRaw(Prisma.sql`DELETE FROM "GovernanceElectionBallotDraftDecision" WHERE "societyId"=${societyA}::uuid`)).rejects.toThrow();
    }finally{
      try{
        await prisma.$transaction(async tx=>{
          for(const table of ['GovernanceElectionBallotDraftDecision','GovernanceElectionBallotDraftOption','GovernanceElectionBallotDraft','GovernanceElectorateReviewAttestation','GovernanceElectorateMember','GovernanceElectorateSnapshot','GovernanceElectionPolicyRevision']){
            await tx.$executeRaw(Prisma.sql`ALTER TABLE ${Prisma.raw(`"${table}"`)} DISABLE TRIGGER ${Prisma.raw(`"${table}_append_only_delete"`)}`);
            await tx.$executeRaw(Prisma.sql`DELETE FROM ${Prisma.raw(`"${table}"`)} WHERE "societyId" IN (${societyA}::uuid,${societyB}::uuid)`);
            await tx.$executeRaw(Prisma.sql`ALTER TABLE ${Prisma.raw(`"${table}"`)} ENABLE TRIGGER ${Prisma.raw(`"${table}_append_only_delete"`)}`);
          }
        });
        await prisma.society.deleteMany({where:{id:{in:[societyA,societyB]}}});await prisma.user.deleteMany({where:{id:{in:[policyAuthor,snapshotAuthor,reviewer,draftAuthor]}}});
      }finally{await prisma.$disconnect();}
    }
  });
});
