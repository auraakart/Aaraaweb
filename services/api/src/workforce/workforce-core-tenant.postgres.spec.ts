import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceService } from './workforce.service';
import { AccessService } from '../access/access.service';

const withDatabase = process.env.DATABASE_URL ? describe : describe.skip;

withDatabase('V5.2.26 workforce reviewer, resident and gate read boundaries on PostgreSQL', () => {
  it('rejects cross-society and former-resident mutations and serializes reviewer decisions', async () => {
    const prisma = new PrismaService();
    const service = new WorkforceService(prisma, {} as AccessService);
    const a = {society:randomUUID(),building:randomUUID(),unit:randomUUID(),household:randomUUID(),
      worker:randomUUID(),assignment:randomUUID(),resident:randomUUID()};
    const b = {society:randomUUID(),building:randomUUID(),unit:randomUUID(),household:randomUUID(),
      worker:randomUUID(),assignment:randomUUID(),resident:randomUUID()};
    try {
      await prisma.society.createMany({data:[
        {id:a.society,name:'Core fixture A',code:'core-'+a.society},
        {id:b.society,name:'Core fixture B',code:'core-'+b.society},
      ]});
      await prisma.user.createMany({data:[a.resident,b.resident].map(id=>({id,phone:'core-'+id}))});
      await prisma.building.createMany({data:[
        {id:a.building,societyId:a.society,name:'A',code:'A'},
        {id:b.building,societyId:b.society,name:'B',code:'B'},
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
        {id:a.worker,societyId:a.society,name:'Maya A',phone:'worker-'+a.worker,role:'MAID',verification:'VERIFIED'},
        {id:b.worker,societyId:b.society,name:'Maya B',phone:'worker-'+b.worker,role:'MAID',verification:'VERIFIED'},
      ]});
      await prisma.workforceAssignment.createMany({data:[
        {id:a.assignment,societyId:a.society,householdId:a.household,workerId:a.worker,status:'PENDING'},
        {id:b.assignment,societyId:b.society,householdId:b.household,workerId:b.worker,status:'PENDING'},
      ]});

      await expect(service.review(a.society,b.assignment,'APPROVED'))
        .rejects.toThrow('Active workforce assignment not found');
      const result=await Promise.allSettled([
        service.review(a.society,a.assignment,'APPROVED'),
        service.review(a.society,a.assignment,'REJECTED'),
      ]);
      expect(result.filter(x=>x.status==='fulfilled')).toHaveLength(1);
      expect(result.filter(x=>x.status==='rejected')).toHaveLength(1);
      expect((result.find(x=>x.status==='rejected') as PromiseRejectedResult).reason.message)
        .toContain('Only pending workforce assignments can be reviewed');
      const accepted=await prisma.workforceAssignment.findUniqueOrThrow({where:{id:a.assignment}});
      expect(['APPROVED','REJECTED']).toContain(accepted.status);
      if(accepted.status==='APPROVED') {
        expect((await service.listGateEligible(a.society)).map(x=>x.id)).toEqual([a.assignment]);
      } else {
        expect(await service.listGateEligible(a.society)).toEqual([]);
      }
      expect(await service.listGateEligible(b.society)).toEqual([]);
      await expect(service.residentStatusMine(a.society,b.resident,a.unit))
        .rejects.toThrow('Household workforce not found');
      await expect(service.deactivateMine(a.society,b.resident,a.assignment))
        .rejects.toThrow('Household not found');
      await expect(service.deactivateMine(b.society,b.resident,a.assignment))
        .rejects.toThrow('Active workforce assignment not found');
      expect((await prisma.workforceAssignment.findUniqueOrThrow({where:{id:a.assignment}})).active).toBe(true);
      await expect(service.deactivateMine(a.society,a.resident,a.assignment))
        .resolves.toMatchObject({active:false});
      await expect(service.deactivateMine(a.society,a.resident,a.assignment))
        .rejects.toThrow('Active workforce assignment not found');
      expect(await service.listGateEligible(a.society)).toEqual([]);
    } finally {
      try {
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
