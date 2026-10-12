import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceRatingService } from './workforce-rating.service';
import { WorkforceSuspensionService } from './workforce-suspension.service';

const withDatabase = process.env.DATABASE_URL ? describe : describe.skip;

withDatabase('V5.2.25 workforce ratings and suspension isolation on PostgreSQL', () => {
  it('enforces two-society ownership and serializes suspension events and rating updates', async () => {
    const prisma = new PrismaService();
    const ratings = new WorkforceRatingService(prisma);
    const control = new WorkforceSuspensionService(prisma);
    const a = {
      society: randomUUID(), building: randomUUID(), unit: randomUUID(),
      household: randomUUID(), worker: randomUUID(), assignment: randomUUID(), resident: randomUUID(),
    };
    const b = {
      society: randomUUID(), building: randomUUID(), unit: randomUUID(),
      household: randomUUID(), worker: randomUUID(), assignment: randomUUID(), resident: randomUUID(),
    };
    const reviewer = randomUUID();
    try {
      await prisma.society.createMany({data:[
        {id:a.society,name:'Rating fixture A',code:'rating-'+a.society},
        {id:b.society,name:'Rating fixture B',code:'rating-'+b.society},
      ]});
      await prisma.user.createMany({data:[a.resident,b.resident,reviewer].map(id=>({
        id,phone:'rating-'+id,
      }))});
      await prisma.building.createMany({data:[
        {id:a.building,societyId:a.society,name:'Block A',code:'A'},
        {id:b.building,societyId:b.society,name:'Block B',code:'B'},
      ]});
      await prisma.unit.createMany({data:[
        {id:a.unit,societyId:a.society,buildingId:a.building,number:'101'},
        {id:b.unit,societyId:b.society,buildingId:b.building,number:'101'},
      ]});
      await prisma.household.createMany({data:[
        {id:a.household,societyId:a.society,unitId:a.unit},
        {id:b.household,societyId:b.society,unitId:b.unit},
      ]});
      await prisma.unitOccupancy.createMany({data:[
        {societyId:a.society,unitId:a.unit,userId:a.resident,relation:'TENANT'},
        {societyId:b.society,unitId:b.unit,userId:b.resident,relation:'TENANT'},
      ]});
      await prisma.domesticWorker.createMany({data:[
        {id:a.worker,societyId:a.society,name:'Worker A',phone:'worker-'+a.worker,role:'MAID',verification:'VERIFIED'},
        {id:b.worker,societyId:b.society,name:'Worker B',phone:'worker-'+b.worker,role:'MAID',verification:'VERIFIED'},
      ]});
      await prisma.workforceAssignment.createMany({data:[
        {id:a.assignment,societyId:a.society,householdId:a.household,workerId:a.worker,status:'APPROVED'},
        {id:b.assignment,societyId:b.society,householdId:b.household,workerId:b.worker,status:'APPROVED'},
      ]});

      await expect(ratings.rateMine(a.society,b.resident,a.assignment,{score:5}))
        .rejects.toThrow('Workforce assignment not found');
      await expect(ratings.rateMine(a.society,a.resident,b.assignment,{score:5}))
        .rejects.toThrow('Workforce assignment not found');
      await expect(ratings.rateMine(a.society,a.resident,a.assignment,{score:4,comment:'Excellent'}))
        .resolves.toMatchObject({societyId:a.society,workerId:a.worker,score:4});
      await expect(ratings.rateMine(b.society,b.resident,b.assignment,{score:2}))
        .resolves.toMatchObject({societyId:b.society,workerId:b.worker,score:2});
      expect((await ratings.listMine(a.society,a.resident)).map(x=>x.assignmentId)).toEqual([a.assignment]);
      expect(await ratings.listMine(a.society,b.resident)).toEqual([]);
      expect((await ratings.societySummary(a.society)).map(x=>x.workerId)).toEqual([a.worker]);
      expect((await ratings.societySummary(b.society)).map(x=>x.workerId)).toEqual([b.worker]);

      await expect(control.suspendWorker(a.society,b.worker,reviewer,'Safety concern'))
        .rejects.toThrow('Active domestic worker not found');
      await expect(control.suspendAssignment(a.society,b.assignment,reviewer,'Safety concern'))
        .rejects.toThrow('Active workforce assignment not found');
      expect(await control.history(a.society)).toEqual([]);

      // A missing actor fails the audit foreign key: the status update must roll back.
      await expect(control.suspendWorker(a.society,a.worker,randomUUID(),'Audit rollback probe'))
        .rejects.toThrow();
      expect((await prisma.domesticWorker.findUniqueOrThrow({where:{id:a.worker}})).verification).toBe('VERIFIED');

      const concurrent = await Promise.all([
        control.suspendWorker(a.society,a.worker,reviewer,'Worker suspension'),
        control.suspendWorker(a.society,a.worker,reviewer,'Worker suspension'),
      ]);
      expect(concurrent.every(x=>x.verification==='SUSPENDED')).toBe(true);
      expect((await control.history(a.society)).filter(x=>(x as {action:string}).action==='SUSPEND')).toHaveLength(1);
      await control.reinstateWorker(a.society,a.worker,reviewer);
      await control.suspendAssignment(a.society,a.assignment,reviewer,'Assignment suspension');
      await control.suspendWorker(a.society,a.worker,reviewer,'Verification suspended');
      await expect(control.reinstateAssignment(a.society,a.assignment,reviewer))
        .rejects.toThrow('Domestic worker must be active and verified before assignment reinstatement');
      await control.reinstateWorker(a.society,a.worker,reviewer);
      await expect(control.reinstateAssignment(a.society,a.assignment,reviewer))
        .resolves.toMatchObject({status:'APPROVED'});
      expect((await control.history(a.society))).toHaveLength(6);
      expect(await control.history(b.society)).toEqual([]);
      expect((await control.listSuspended(a.society)).workers).toEqual([]);

      // Re-rating the same assignment updates its one record, not another society.
      await ratings.rateMine(a.society,a.resident,a.assignment,{score:5});
      expect((await ratings.listMine(a.society,a.resident))).toMatchObject([{score:5}]);
      expect((await ratings.listMine(b.society,b.resident))).toMatchObject([{score:2}]);
    } finally {
      try {
        await prisma.workforceSuspensionEvent.deleteMany({where:{societyId:{in:[a.society,b.society]}}});
        await prisma.workforceRating.deleteMany({where:{societyId:{in:[a.society,b.society]}}});
        await prisma.workforceAssignment.deleteMany({where:{societyId:{in:[a.society,b.society]}}});
        await prisma.domesticWorker.deleteMany({where:{societyId:{in:[a.society,b.society]}}});
        await prisma.unitOccupancy.deleteMany({where:{societyId:{in:[a.society,b.society]}}});
        await prisma.household.deleteMany({where:{societyId:{in:[a.society,b.society]}}});
        await prisma.unit.deleteMany({where:{societyId:{in:[a.society,b.society]}}});
        await prisma.building.deleteMany({where:{societyId:{in:[a.society,b.society]}}});
        await prisma.society.deleteMany({where:{id:{in:[a.society,b.society]}}});
        await prisma.user.deleteMany({where:{id:{in:[a.resident,b.resident,reviewer]}}});
      } finally {
        await prisma.$disconnect();
      }
    }
  });
});
