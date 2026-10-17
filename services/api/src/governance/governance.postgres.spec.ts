import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { describe,expect,it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { GovernanceService } from './governance.service';

const withDatabase=process.env.DATABASE_URL?describe:describe.skip;
withDatabase('V5 governance core transactions on PostgreSQL',()=>{
  it('isolates parent/child resources, serializes first tenures and rolls back evidence failures',async()=>{
    const prisma=new PrismaService(),service=new GovernanceService(prisma);
    const societyA=randomUUID(),societyB=randomUUID(),actor=randomUUID();
    const at=new Date('2026-10-01T00:00:00Z');
    try{
      await prisma.society.createMany({data:[
        {id:societyA,name:'Governance A',code:`governance-${societyA}`},
        {id:societyB,name:'Governance B',code:`governance-${societyB}`},
      ]});
      await prisma.user.create({data:{id:actor,phone:`governance-${actor}`,name:'Governance fixture'}});
      const input={userId:actor,roleName:'Secretary',effectiveFrom:at};
      const attempts=await Promise.allSettled([
        service.createTenure(societyA,actor,input),service.createTenure(societyA,actor,input),
      ]);
      expect(attempts.filter(a=>a.status==='fulfilled')).toHaveLength(1);
      expect((attempts.find(a=>a.status==='rejected') as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
      const tenureA=(attempts.find(a=>a.status==='fulfilled') as PromiseFulfilledResult<Record<string,unknown>>).value.id as string;
      const tenureB=(await service.createTenure(societyB,actor,input)).id as string;
      expect(await service.listCommittee(societyA)).toEqual([expect.objectContaining({id:tenureA})]);
      await expect(service.endTenure(societyA,actor,tenureB,at)).rejects.toBeInstanceOf(NotFoundException);
      await service.endTenure(societyA,actor,tenureA,new Date('2026-10-02T00:00:00Z'),'Handed over');
      await expect(service.endTenure(societyA,actor,tenureA,at)).rejects.toBeInstanceOf(ConflictException);
      const meetingInput={meetingType:'COMMITTEE' as const,title:'Budget review',scheduledAt:at};
      const meetingA=(await service.createMeeting(societyA,actor,meetingInput)).id as string;
      const meetingB=(await service.createMeeting(societyB,actor,meetingInput)).id as string;
      const otherMeeting=(await service.createMeeting(societyA,actor,{...meetingInput,title:'Other meeting'})).id as string;
      expect(await service.listMeetings(societyB)).toEqual([expect.objectContaining({id:meetingB})]);
      await expect(service.getMeeting(societyA,meetingB)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.recordMeetingOutcome(societyA,actor,meetingB,{status:'HELD'})).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.addAgenda(societyA,actor,meetingB,{ordinal:1,title:'Foreign'})).rejects.toBeInstanceOf(NotFoundException);
      const agendaA=(await service.addAgenda(societyA,actor,meetingA,{ordinal:1,title:'Budget'})).id as string;
      const agendaOther=(await service.addAgenda(societyA,actor,otherMeeting,{ordinal:1,title:'Other'})).id as string;
      const agendaB=(await service.addAgenda(societyB,actor,meetingB,{ordinal:1,title:'Other society'})).id as string;
      const resolutionInput={title:'Budget',resolutionText:'Approve budget',status:'PASSED' as const};
      for(const agendaItemId of [agendaOther,agendaB])await expect(service.addResolution(societyA,actor,meetingA,{...resolutionInput,agendaItemId})).rejects.toBeInstanceOf(BadRequestException);
      const resolutionA=(await service.addResolution(societyA,actor,meetingA,{...resolutionInput,agendaItemId:agendaA})).id as string;
      const resolutionOther=(await service.addResolution(societyA,actor,otherMeeting,resolutionInput)).id as string;
      const resolutionB=(await service.addResolution(societyB,actor,meetingB,resolutionInput)).id as string;
      for(const resolutionId of [resolutionOther,resolutionB])await expect(service.addAction(societyA,actor,meetingA,{title:'Foreign resolution',resolutionId})).rejects.toBeInstanceOf(BadRequestException);
      const actionA=(await service.addAction(societyA,actor,meetingA,{title:'Prepare minutes',resolutionId:resolutionA,ownerUserId:actor})).id as string;
      const actionB=(await service.addAction(societyB,actor,meetingB,{title:'Other society action'})).id as string;
      await expect(service.updateAction(societyA,actor,meetingA,actionB,{status:'COMPLETED'})).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.updateAction(societyA,actor,otherMeeting,actionA,{status:'COMPLETED'})).rejects.toBeInstanceOf(NotFoundException);
      await service.recordMeetingOutcome(societyA,actor,meetingA,{status:'HELD',quorumPresent:5,minutesSummary:'Budget approved'});
      await service.updateAction(societyA,actor,meetingA,actionA,{status:'COMPLETED'});
      const before=await service.getMeeting(societyA,meetingA);
      expect(before).toMatchObject({status:'HELD',agenda:[{id:agendaA}],resolutions:[{id:resolutionA}],actions:[{id:actionA,status:'COMPLETED'}]});
      expect((before.evidence as Array<{eventType:string}>).map(e=>e.eventType)).toEqual(expect.arrayContaining(['MEETING_CREATED','AGENDA_ADDED','RESOLUTION_RECORDED','ACTION_CREATED','MEETING_OUTCOME_RECORDED','ACTION_UPDATED']));

      await expect(prisma.$executeRaw(Prisma.sql`DELETE FROM "GovernanceEvidenceEvent" WHERE "societyId"=${societyA}::uuid`)).rejects.toThrow('append-only');
      expect(await service.getMeeting(societyA,meetingA)).toEqual(before);
      const failingService=new GovernanceService({
        withTenantContext:<T>(societyId:string,run:(tx:Prisma.TransactionClient)=>Promise<T>)=>prisma.withTenantContext(societyId,tx=>run(new Proxy(tx,{
          get(target,key){
            if(key==='$executeRaw')return async()=>{throw new Error('Evidence unavailable');};
            return Reflect.get(target,key);
          },
        }))),
      } as unknown as PrismaService);
      const failures=[
        ()=>failingService.createMeeting(societyA,actor,{...meetingInput,title:'Rollback meeting'}),
        ()=>failingService.recordMeetingOutcome(societyA,actor,meetingA,{status:'CANCELLED'}),
        ()=>failingService.addAgenda(societyA,actor,meetingA,{ordinal:2,title:'Rollback agenda'}),
        ()=>failingService.addResolution(societyA,actor,meetingA,resolutionInput),
        ()=>failingService.addAction(societyA,actor,meetingA,{title:'Rollback action'}),
        ()=>failingService.updateAction(societyA,actor,meetingA,actionA,{status:'CANCELLED'}),
      ];
      for(const fail of failures){
        await expect(fail()).rejects.toThrow('Evidence unavailable');
        expect(await service.getMeeting(societyA,meetingA)).toEqual(before);
      }
      expect(await service.listMeetings(societyA)).toHaveLength(2);
      expect(await service.getMeeting(societyB,meetingB)).toMatchObject({status:'DRAFT',agenda:[{id:agendaB}],actions:[{id:actionB,status:'OPEN'}]});
    }finally{
      try{
        // Disposable fixture only: the table lock and transactional DDL restore the append-only trigger even on failure.
        await prisma.$transaction(async tx=>{
          await tx.$executeRaw(Prisma.sql`ALTER TABLE "GovernanceEvidenceEvent" DISABLE TRIGGER "GovernanceEvidenceEvent_append_only_delete"`);
          for(const table of ['GovernanceEvidenceEvent','GovernanceActionItem','GovernanceResolution','GovernanceAgendaItem','GovernanceMeeting','GovernanceCommitteeTenure']){
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
