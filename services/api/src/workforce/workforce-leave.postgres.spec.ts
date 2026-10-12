import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceLeaveService } from './workforce-leave.service';

const withDatabase = process.env.DATABASE_URL ? describe : describe.skip;

withDatabase('V5.2.24 workforce leave isolation and concurrent overlap on PostgreSQL', () => {
  it('separates two societies and serializes overlapping requests from the same resident', async () => {
    const prisma = new PrismaService();
    const leaves = new WorkforceLeaveService(prisma);
    const a = {
      society: randomUUID(), building: randomUUID(), unit: randomUUID(),
      household: randomUUID(), worker: randomUUID(), assignment: randomUUID(), resident: randomUUID(),
    };
    const b = {
      society: randomUUID(), building: randomUUID(), unit: randomUUID(),
      household: randomUUID(), worker: randomUUID(), assignment: randomUUID(), resident: randomUUID(),
    };
    try {
      await prisma.society.createMany({data:[
        {id:a.society,name:'Leave fixture A',code:'leave-'+a.society},
        {id:b.society,name:'Leave fixture B',code:'leave-'+b.society},
      ]});
      await prisma.user.createMany({data:[a.resident,b.resident].map(id=>({id,phone:'leave-'+id}))});
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
        {id:a.worker,societyId:a.society,name:'Worker A',phone:'worker-'+a.worker,role:'MAID'},
        {id:b.worker,societyId:b.society,name:'Worker B',phone:'worker-'+b.worker,role:'MAID'},
      ]});
      await prisma.workforceAssignment.createMany({data:[
        {id:a.assignment,societyId:a.society,householdId:a.household,workerId:a.worker,status:'APPROVED'},
        {id:b.assignment,societyId:b.society,householdId:b.household,workerId:b.worker,status:'APPROVED'},
      ]});

      const req = (assignmentId:string, startsOn:string, endsOn:string) => ({
        assignmentId, startsOn, endsOn, reason:'Planned leave',
      });
      await expect(leaves.createMine(a.society,b.resident,req(a.assignment,'2026-11-11','2026-11-13')))
        .rejects.toThrow('Active workforce assignment not found');
      await expect(leaves.createMine(a.society,a.resident,req(b.assignment,'2026-11-11','2026-11-13')))
        .rejects.toThrow('Active workforce assignment not found');

      const results = await Promise.allSettled([
        leaves.createMine(a.society,a.resident,req(a.assignment,'2026-11-11','2026-11-13')),
        leaves.createMine(a.society,a.resident,req(a.assignment,'2026-11-12','2026-11-14')),
      ]);
      expect(results.filter(row=>row.status==='fulfilled')).toHaveLength(1);
      expect(results.filter(row=>row.status==='rejected')).toHaveLength(1);
      expect((results.find(row=>row.status==='rejected') as PromiseRejectedResult).reason.message)
        .toContain('An active workforce leave already overlaps this date range');

      const own = await leaves.listMine(a.society,a.resident);
      expect(own).toHaveLength(1);
      expect(await leaves.listMine(a.society,b.resident)).toEqual([]);
      expect(await leaves.listMine(b.society,b.resident)).toEqual([]);
      expect(await leaves.listSocietyActive(a.society,'2026-11-12')).toHaveLength(1);
      expect(await leaves.listSocietyActive(b.society,'2026-11-12')).toEqual([]);
      await expect(leaves.assertNoActiveLeave(a.society,a.assignment,new Date('2026-11-12T12:00:00Z')))
        .rejects.toThrow('Worker is on approved leave today');
      expect(await leaves.activeAssignmentIds(a.society,[a.assignment,b.assignment],
        new Date('2026-11-12T12:00:00Z'))).toEqual(new Set([a.assignment]));
      expect(await leaves.activeAssignmentIds(b.society,[a.assignment,b.assignment],
        new Date('2026-11-12T12:00:00Z'))).toEqual(new Set());

      await expect(leaves.cancelMine(a.society,b.resident,own[0].id))
        .rejects.toThrow('Active workforce leave not found');
      await expect(leaves.cancelMine(b.society,b.resident,own[0].id))
        .rejects.toThrow('Active workforce leave not found');
      const cancelled=await leaves.cancelMine(a.society,a.resident,own[0].id);
      expect(cancelled.active).toBe(false);
      await expect(leaves.cancelMine(a.society,a.resident,own[0].id))
        .rejects.toThrow('Active workforce leave not found');
      expect(await leaves.listSocietyActive(a.society,'2026-11-12')).toEqual([]);
      await expect(leaves.createMine(a.society,a.resident,req(a.assignment,'2026-11-12','2026-11-14')))
        .resolves.toMatchObject({societyId:a.society,assignmentId:a.assignment,active:true});
      expect((await leaves.listSocietyActive(a.society,'2026-11-12'))).toHaveLength(1);
    } finally {
      try {
        await prisma.workforceLeave.deleteMany({where:{societyId:{in:[a.society,b.society]}}});
        await prisma.workforceAssignment.deleteMany({where:{societyId:{in:[a.society,b.society]}}});
        await prisma.domesticWorker.deleteMany({where:{societyId:{in:[a.society,b.society]}}});
        await prisma.unitOccupancy.deleteMany({where:{societyId:{in:[a.society,b.society]}}});
        await prisma.household.deleteMany({where:{societyId:{in:[a.society,b.society]}}});
        await prisma.unit.deleteMany({where:{societyId:{in:[a.society,b.society]}}});
        await prisma.building.deleteMany({where:{societyId:{in:[a.society,b.society]}}});
        await prisma.society.deleteMany({where:{id:{in:[a.society,b.society]}}});
        await prisma.user.deleteMany({where:{id:{in:[a.resident,b.resident]}}});
      } finally {
        await prisma.$disconnect();
      }
    }
  });
});
