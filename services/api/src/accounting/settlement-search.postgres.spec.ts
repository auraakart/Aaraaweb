import { randomUUID } from 'node:crypto';
import { describe,expect,it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { SettlementService } from './settlement.service';
const database=process.env.DATABASE_URL?describe:describe.skip;
database('V5.7 native payment search',()=>{
 it('separates identical payer/reference matches across societies and only labels verified receipts',async()=>{
  const db=new PrismaService(),service=new SettlementService(db),a=randomUUID(),b=randomUUID(),user=randomUUID(),one=randomUUID(),two=randomUUID(),ba=randomUUID(),bb=randomUUID(),ua=randomUUID(),ub=randomUUID(),ia=randomUUID(),ib=randomUUID();
  try{
   await db.society.createMany({data:[{id:a,code:a,name:'A'},{id:b,code:b,name:'B'}]});
   await db.user.create({data:{id:user,phone:user,name:'V57 payer '+user}});
   await db.building.createMany({data:[{id:ba,societyId:a,name:'Tower A',code:'A'},{id:bb,societyId:b,name:'Tower B',code:'B'}]});
   await db.unit.createMany({data:[{id:ua,societyId:a,buildingId:ba,number:'V57-101'},{id:ub,societyId:b,buildingId:bb,number:'V57-101'}]});
   await db.maintenanceInvoice.createMany({data:[{id:ia,societyId:a,unitId:ua,createdById:user,invoiceNumber:'V57-INV',billingPeriod:'2026-10',amountPaise:12000,dueDate:new Date('2026-10-01')},{id:ib,societyId:b,unitId:ub,createdById:user,invoiceNumber:'V57-INV',billingPeriod:'2026-10',amountPaise:5000,dueDate:new Date('2026-10-01')}]});
   await db.payment.createMany({data:[{id:one,societyId:a,invoiceId:ia,payerUserId:user,idempotencyKey:'search',provider:'MOCK',providerOrderId:one,providerPaymentId:'COMMON-'+user,amountPaise:12000,status:'CAPTURED'},{id:two,societyId:b,invoiceId:ib,payerUserId:user,idempotencyKey:'search',provider:'MOCK',providerOrderId:two,providerPaymentId:'COMMON-'+user,amountPaise:5000,status:'CREATED'}]});
   const rows=await service.searchPayments(a,'COMMON-'+user) as Array<{id:string;receiptNumber:string}>;
   expect(rows.map(r=>r.id)).toEqual([one]);expect(rows[0].receiptNumber).toBe('AGR-'+one.slice(0,8).toUpperCase());
   const pending=await service.searchPayments(b,'COMMON-'+user) as Array<{receiptNumber:unknown}>;expect(pending[0].receiptNumber).toBeNull();
   expect(await service.searchPayments(b,'AGR-'+two.slice(0,8))).toEqual([]);
   expect(await service.searchPayments(a,'V57 payer '+user)).toHaveLength(1);
   expect(await service.searchPayments(a,'V57-101')).toHaveLength(1);
   expect(await service.searchPayments(a,'V57-INV')).toHaveLength(1);
  }finally{try{await db.payment.deleteMany({where:{id:{in:[one,two]}}});await db.maintenanceInvoice.deleteMany({where:{id:{in:[ia,ib]}}});await db.unit.deleteMany({where:{id:{in:[ua,ub]}}});await db.building.deleteMany({where:{id:{in:[ba,bb]}}});await db.society.deleteMany({where:{id:{in:[a,b]}}});await db.user.deleteMany({where:{id:user}})}finally{await db.$disconnect()}}
 });
});
