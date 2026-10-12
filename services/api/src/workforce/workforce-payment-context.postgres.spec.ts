import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { WorkforceService } from './workforce.service';

const database=process.env.DATABASE_URL?describe:describe.skip;
database('V5.2.28 tenant-scoped workforce payment and attendance on PostgreSQL',()=>{
  it('isolate private payment records and replays safely while resident authority is active',async()=>{
    const prisma=new PrismaService();
    const service=new WorkforceService(prisma,{} as AccessService);
    const a={society:randomUUID(),building:randomUUID(),unit:randomUUID(),household:randomUUID(),
      worker:randomUUID(),assignment:randomUUID(),resident:randomUUID()};
    const b={society:randomUUID(),building:randomUUID(),unit:randomUUID(),household:randomUUID(),
      worker:randomUUID(),assignment:randomUUID(),resident:randomUUID()};
    const payment=(assignmentId:string,idempotencyKey:string,amountPaise=25000)=>({
      assignmentId,kind:'SALARY',amountPaise,paymentDate:'2026-10-05',idempotencyKey,
      note:'Recorded by household only',
    });
    try{
      await prisma.society.createMany({data:[
        {id:a.society,name:'Payment fixture A',code:'pay-'+a.society},
        {id:b.society,name:'Payment fixture B',code:'pay-'+b.society},
      ]});
      await prisma.user.createMany({data:[a.resident,b.resident].map(id=>({id,phone:'pay-'+id}))});
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
        {id:a.worker,societyId:a.society,name:'Worker A',phone:'worker-'+a.worker,role:'MAID'},
        {id:b.worker,societyId:b.society,name:'Worker B',phone:'worker-'+b.worker,role:'MAID'},
      ]});
      await prisma.workforceAssignment.createMany({data:[
        {id:a.assignment,societyId:a.society,householdId:a.household,workerId:a.worker,status:'APPROVED'},
        {id:b.assignment,societyId:b.society,householdId:b.household,workerId:b.worker,status:'APPROVED'},
      ]});
      await expect(service.createPaymentRecordMine(a.society,b.resident,payment(a.assignment,'pay-foreign-0001')))
        .rejects.toThrow('Household not found');
      await expect(service.createPaymentRecordMine(a.society,a.resident,payment(b.assignment,'pay-foreign-0002')))
        .rejects.toThrow('Household staff assignment not found');
      const attempts=await Promise.all([
        service.createPaymentRecordMine(a.society,a.resident,payment(a.assignment,'pay-concurrent-01')),
        service.createPaymentRecordMine(a.society,a.resident,payment(a.assignment,'pay-concurrent-01')),
      ]);
      expect(attempts[0].id).toBe(attempts[1].id);
      expect((await service.paymentRecordsMine(a.society,a.resident)).map(x=>x.id)).toEqual([attempts[0].id]);
      expect(await service.paymentRecordsMine(a.society,b.resident)).toEqual([]);
      expect(await service.paymentRecordsMine(b.society,b.resident)).toEqual([]);
      await expect(service.createPaymentRecordMine(a.society,a.resident,payment(a.assignment,'pay-concurrent-01',26000)))
        .rejects.toThrow('Idempotency key was already used for a different staff payment record');
      await expect(service.attendanceMine(a.society,b.resident,a.assignment))
        .rejects.toThrow('Household not found');
      await expect(service.attendanceMine(a.society,a.resident,b.assignment))
        .rejects.toThrow('Household staff assignment not found');
      const attendance=await service.attendanceMine(a.society,a.resident,a.assignment,'2026-10-05','2026-10-06');
      expect(attendance.summary.totalVisits).toBe(0);
      expect(attendance.summary.leavePeriods).toBe(0);
      await expect(service.addWorker(a.society,b.resident,{
        householdId:a.household,name:'Unauthorized',phone:'99990001',role:'MAID',
      })).rejects.toThrow('Household not found');
      const added=await service.addWorker(a.society,a.resident,{
        householdId:a.household,name:'Approved new staff',phone:'99990002',role:'MAID',
      });
      expect(added.societyId).toBe(a.society);
      await prisma.unitOccupancy.updateMany({where:{societyId:a.society,userId:a.resident},data:{active:false}});
      await expect(service.createPaymentRecordMine(a.society,a.resident,payment(a.assignment,'pay-concurrent-01')))
        .rejects.toThrow('Household not found');
      await expect(service.attendanceMine(a.society,a.resident,a.assignment))
        .rejects.toThrow('Household not found');
    }finally{
      try{
        await prisma.workforcePaymentRecord.deleteMany({where:{societyId:{in:[a.society,b.society]}}});
        await prisma.workforceAssignment.deleteMany({where:{societyId:{in:[a.society,b.society]}}});
        await prisma.domesticWorker.deleteMany({where:{societyId:{in:[a.society,b.society]}}});
        await prisma.unitOccupancy.deleteMany({where:{societyId:{in:[a.society,b.society]}}});
        await prisma.household.deleteMany({where:{societyId:{in:[a.society,b.society]}}});
        await prisma.unit.deleteMany({where:{societyId:{in:[a.society,b.society]}}});
        await prisma.building.deleteMany({where:{societyId:{in:[a.society,b.society]}}});
        await prisma.society.deleteMany({where:{id:{in:[a.society,b.society]}}});
        await prisma.user.deleteMany({where:{id:{in:[a.resident,b.resident]}}});
      }finally{await prisma.$disconnect();}
    }
  });
});
