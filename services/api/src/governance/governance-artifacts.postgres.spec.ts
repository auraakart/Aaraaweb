import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { describe,expect,it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { GovernanceService } from './governance.service';
import { GovernanceArtifactsController } from './governance-artifacts.controller';

const withDatabase=process.env.DATABASE_URL?describe:describe.skip;
withDatabase('V5 governance artifact transactions on PostgreSQL',()=>{
  it('isolates documents/polls and rolls back audit or option failures',async()=>{
    const prisma=new PrismaService(),governance=new GovernanceService(prisma),controller=new GovernanceArtifactsController(prisma);
    const societyA=randomUUID(),societyB=randomUUID(),actor=randomUUID();
    try{
      await prisma.society.createMany({data:[
        {id:societyA,name:'Artifacts A',code:`artifact-${societyA}`},
        {id:societyB,name:'Artifacts B',code:`artifact-${societyB}`},
      ]});
      await prisma.user.create({data:{id:actor,phone:`artifact-${actor}`,name:'Artifacts fixture'}});
      const meetingInput={meetingType:'COMMITTEE' as const,title:'Artifact fixture',scheduledAt:new Date('2026-10-01T00:00:00Z')};
      const meetingA=(await governance.createMeeting(societyA,actor,meetingInput)).id as string;
      const meetingOther=(await governance.createMeeting(societyA,actor,meetingInput)).id as string;
      const meetingB=(await governance.createMeeting(societyB,actor,meetingInput)).id as string;
      const resolutionInput={title:'Minutes',resolutionText:'Approve minutes',status:'PASSED' as const};
      const resolutionA=(await governance.addResolution(societyA,actor,meetingA,resolutionInput)).id as string;
      const resolutionOther=(await governance.addResolution(societyA,actor,meetingOther,resolutionInput)).id as string;
      const resolutionB=(await governance.addResolution(societyB,actor,meetingB,resolutionInput)).id as string;
      const documentInput={kind:'MINUTES',fileReference:'fixture/minutes.pdf',note:'Fixture reference only'};
      await expect(controller.listDocuments(societyA,meetingB)).rejects.toBeInstanceOf(NotFoundException);
      await expect(controller.addDocument(societyA,actor,meetingB,documentInput)).rejects.toBeInstanceOf(NotFoundException);
      for(const resolutionId of [resolutionOther,resolutionB])await expect(controller.addDocument(societyA,actor,meetingA,{...documentInput,resolutionId})).rejects.toBeInstanceOf(BadRequestException);
      const documentA=(await controller.addDocument(societyA,actor,meetingA,{...documentInput,resolutionId:resolutionA})).id as string;
      const documentB=(await controller.addDocument(societyB,actor,meetingB,{...documentInput,resolutionId:resolutionB})).id as string;
      await expect(controller.verifyDocument(societyA,actor,documentB,{})).rejects.toBeInstanceOf(NotFoundException);
      const before=await governance.getMeeting(societyA,meetingA);
      const beforeDocuments=await controller.listDocuments(societyA,meetingA);
      const failingController=new GovernanceArtifactsController({
        withTenantContext:<T>(societyId:string,run:(tx:Prisma.TransactionClient)=>Promise<T>)=>prisma.withTenantContext(societyId,tx=>run(new Proxy(tx,{
          get(target,key){
            if(key==='$executeRaw')return async()=>{throw new Error('Evidence unavailable');};
            return Reflect.get(target,key);
          },
        }))),
      } as unknown as PrismaService);
      await expect(failingController.addDocument(societyA,actor,meetingA,documentInput)).rejects.toThrow('Evidence unavailable');
      await expect(failingController.verifyDocument(societyA,actor,documentA,{note:'Must roll back'})).rejects.toThrow('Evidence unavailable');
      expect(await controller.listDocuments(societyA,meetingA)).toEqual(beforeDocuments);
      expect(await governance.getMeeting(societyA,meetingA)).toEqual(before);
      await expect(controller.verifyDocument(societyA,actor,documentA,{})).resolves.toMatchObject({id:documentA,meetingId:meetingA,kind:'MINUTES'});
      await expect(controller.verifyDocument(societyA,actor,documentA,{})).rejects.toBeInstanceOf(NotFoundException);
      const pending=(await controller.addDocument(societyA,actor,meetingA,documentInput)).id as string;
      const verifications=await Promise.allSettled([
        controller.verifyDocument(societyA,actor,pending,{}),controller.verifyDocument(societyA,actor,pending,{}),
      ]);
      expect(verifications.filter(v=>v.status==='fulfilled')).toHaveLength(1);
      expect((verifications.find(v=>v.status==='rejected') as PromiseRejectedResult).reason).toBeInstanceOf(NotFoundException);
      const evidence=(await governance.getMeeting(societyA,meetingA)).evidence as Array<{eventType:string}>;
      expect(evidence.filter(e=>e.eventType==='DOCUMENT_REFERENCE_VERIFIED')).toHaveLength(2);
      const pollInput={pollType:'ADVISORY' as const,title:'Fixture choice',options:[' Yes ',' No ']};
      await expect(controller.createPoll(societyA,actor,{...pollInput,meetingId:meetingB})).rejects.toBeInstanceOf(NotFoundException);
      const pollA=await controller.createPoll(societyA,actor,{...pollInput,meetingId:meetingA});
      const pollB=await controller.createPoll(societyB,actor,{...pollInput,meetingId:meetingB});
      expect(pollA).toMatchObject({statutoryUseProhibited:true,options:[{ordinal:1,label:'Yes'},{ordinal:2,label:'No'}]});
      await expect(controller.getPoll(societyA,pollB.id)).rejects.toBeInstanceOf(NotFoundException);
      expect(await controller.listPolls(societyA)).toEqual([expect.objectContaining({id:pollA.id})]);
      const pollBefore=await controller.getPoll(societyA,pollA.id);
      // The second option hits a real PostgreSQL varchar constraint after the poll and first option insert.
      await expect(controller.createPoll(societyA,actor,{...pollInput,meetingId:meetingA,options:['Yes','x'.repeat(501)]})).rejects.toThrow();
      expect(await controller.listPolls(societyA)).toEqual([expect.objectContaining({id:pollA.id})]);
      expect(await controller.getPoll(societyA,pollA.id)).toEqual(pollBefore);
      const options=await prisma.$queryRaw<Array<{count:number}>>(Prisma.sql`SELECT COUNT(*)::int AS count FROM "GovernancePollOption" o JOIN "GovernancePoll" p ON p."id"=o."pollId" WHERE p."societyId"=${societyA}::uuid`);
      expect(options).toEqual([{count:2}]);
      expect(await controller.listDocuments(societyB,meetingB)).toEqual([expect.objectContaining({id:documentB,verifiedAt:null})]);
      expect(await controller.listPolls(societyB)).toEqual([expect.objectContaining({id:pollB.id})]);
    }finally{
      try{
        // Disposable fixture cleanup only; transactional DDL/table locking restores the trigger on rollback too.
        await prisma.$transaction(async tx=>{
          await tx.$executeRaw(Prisma.sql`ALTER TABLE "GovernanceEvidenceEvent" DISABLE TRIGGER "GovernanceEvidenceEvent_append_only_delete"`);
          for(const table of ['GovernancePoll','GovernanceDocumentReference','GovernanceEvidenceEvent','GovernanceResolution','GovernanceMeeting']){
            await tx.$executeRaw(Prisma.sql`DELETE FROM ${Prisma.raw(`"${table}"`)} WHERE "societyId" IN (${societyA}::uuid,${societyB}::uuid)`);
          }
          await tx.$executeRaw(Prisma.sql`ALTER TABLE "GovernanceEvidenceEvent" ENABLE TRIGGER "GovernanceEvidenceEvent_append_only_delete"`);
        });
        await prisma.society.deleteMany({where:{id:{in:[societyA,societyB]}}});
        await prisma.user.deleteMany({where:{id:actor}});
      }finally{await prisma.$disconnect();}
    }
  });
});
