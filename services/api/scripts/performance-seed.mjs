import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma=new PrismaClient();
const hash=(value)=>createHash('sha256').update(value).digest('hex');

const ids={
  user:'11111111-1111-4111-8111-111111119901',
  session:'22222222-2222-4222-8222-222222229901',
  society:'33333333-3333-4333-8333-333333339901',
  building:'44444444-4444-4444-8444-444444449901',
  unit:'55555555-5555-4555-8555-555555559901',
  invoice:'66666666-6666-4666-8666-666666669901',
  receivable:'77777777-7777-4777-8777-777777779901',
  membership:'88888888-8888-4888-8888-888888889901',
};
const accessToken=process.env.AARAAGATE_PERF_ACCESS_TOKEN??'aaraagate-perf-access-token-local-ci';
const refreshToken=process.env.AARAAGATE_PERF_REFRESH_TOKEN??'aaraagate-perf-refresh-token-local-ci';
const paymentCount=Math.max(1000,Number(process.env.AARAAGATE_PERF_PAYMENT_COUNT??100000));

try{
  await prisma.society.upsert({
    where:{id:ids.society},
    create:{id:ids.society,name:'Aaraagate Finance Performance Society',code:'PERF9901',status:'ACTIVE',productTier:'ENTERPRISE',featureOverrides:{SOCIETY_ACCOUNTING:true}},
    update:{name:'Aaraagate Finance Performance Society',status:'ACTIVE',productTier:'ENTERPRISE',featureOverrides:{SOCIETY_ACCOUNTING:true}},
  });
  await prisma.building.upsert({
    where:{id:ids.building},
    create:{id:ids.building,societyId:ids.society,name:'Performance Tower',code:'PERF-T'},
    update:{societyId:ids.society,name:'Performance Tower',code:'PERF-T'},
  });
  await prisma.unit.upsert({
    where:{id:ids.unit},
    create:{id:ids.unit,societyId:ids.society,buildingId:ids.building,number:'PERF-101'},
    update:{societyId:ids.society,buildingId:ids.building,number:'PERF-101'},
  });
  await prisma.user.upsert({
    where:{id:ids.user},
    create:{id:ids.user,phone:'+919999999901',name:'Performance CI Accountant',status:'ACTIVE'},
    update:{phone:'+919999999901',name:'Performance CI Accountant',status:'ACTIVE'},
  });
  await prisma.societyMembership.upsert({
    where:{id:ids.membership},
    create:{id:ids.membership,userId:ids.user,societyId:ids.society,role:'ACCOUNTANT',active:true},
    update:{userId:ids.user,societyId:ids.society,role:'ACCOUNTANT',active:true},
  });
  await prisma.maintenanceInvoice.upsert({
    where:{id:ids.invoice},
    create:{
      id:ids.invoice,societyId:ids.society,unitId:ids.unit,createdById:ids.user,
      invoiceNumber:'PERF-INVOICE',billingPeriod:'PERF',description:'Synthetic performance invoice',
      amountPaise:100000,dueDate:new Date('2026-09-30T00:00:00.000Z'),status:'ISSUED',
    },
    update:{description:'Synthetic performance invoice'},
  });
  await prisma.session.upsert({
    where:{id:ids.session},
    create:{
      id:ids.session,userId:ids.user,societyId:ids.society,
      accessTokenHash:hash(accessToken),refreshTokenHash:hash(refreshToken),
      expiresAt:new Date(Date.now()+60*60*1000),refreshExpiresAt:new Date(Date.now()+24*60*60*1000),
      revokedAt:null,revocationReason:null,
    },
    update:{
      userId:ids.user,societyId:ids.society,
      accessTokenHash:hash(accessToken),refreshTokenHash:hash(refreshToken),
      expiresAt:new Date(Date.now()+60*60*1000),refreshExpiresAt:new Date(Date.now()+24*60*60*1000),
      revokedAt:null,revocationReason:null,
    },
  });

  await prisma.$executeRawUnsafe(`
    INSERT INTO "Receivable" (
      "id","societyId","unitId","receivableNumber","billingPeriod","description","amountPaise","dueDate","issuedByUserId"
    ) VALUES (
      '${ids.receivable}'::uuid,'${ids.society}'::uuid,'${ids.unit}'::uuid,'PERF-RECEIVABLE','PERF',
      'Synthetic large-volume payment availability target',20000000000,CURRENT_DATE+30,'${ids.user}'::uuid
    ) ON CONFLICT ("societyId","receivableNumber") DO NOTHING
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO "Payment" (
      "id","societyId","invoiceId","payerUserId","idempotencyKey","provider","providerOrderId",
      "amountPaise","status","completedAt","createdAt","updatedAt"
    )
    SELECT md5('aaraagate-perf-payment-'||g)::uuid,'${ids.society}'::uuid,'${ids.invoice}'::uuid,'${ids.user}'::uuid,
           'perf-payment-'||g,'performance-seed','perf-order-'||g,100000,'CAPTURED'::"PaymentStatus",
           CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
    FROM generate_series(1,${paymentCount}) AS g
    ON CONFLICT ("providerOrderId") DO NOTHING
  `);

  await prisma.$executeRawUnsafe('ALTER TABLE "ReceivableAllocation" DISABLE TRIGGER USER');
  await prisma.$executeRawUnsafe('ALTER TABLE "ReceivableAllocationReversal" DISABLE TRIGGER USER');
  await prisma.$executeRawUnsafe('ALTER TABLE "PaymentRefund" DISABLE TRIGGER USER');
  try{
    await prisma.$executeRawUnsafe(`
      INSERT INTO "ReceivableAllocation" (
        "id","societyId","receivableId","paymentId","amountPaise","idempotencyKey","allocatedByUserId","allocatedAt"
      )
      SELECT md5('aaraagate-perf-allocation-'||g)::uuid,'${ids.society}'::uuid,'${ids.receivable}'::uuid,
             md5('aaraagate-perf-payment-'||g)::uuid,50000,'perf-allocation-'||g,'${ids.user}'::uuid,CURRENT_TIMESTAMP
      FROM generate_series(1,${paymentCount}) AS g
      ON CONFLICT ("societyId","idempotencyKey") DO NOTHING
    `);
    const exceptionCount=Math.min(10000,paymentCount);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "ReceivableAllocationReversal" (
        "id","societyId","allocationId","amountPaise","reason","idempotencyKey","reversedByUserId","reversedAt"
      )
      SELECT md5('aaraagate-perf-reversal-'||g)::uuid,'${ids.society}'::uuid,
             md5('aaraagate-perf-allocation-'||g)::uuid,10000,'Synthetic benchmark reversal',
             'perf-reversal-'||g,'${ids.user}'::uuid,CURRENT_TIMESTAMP
      FROM generate_series(1,${exceptionCount}) AS g
      ON CONFLICT ("societyId","idempotencyKey") DO NOTHING
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "PaymentRefund" (
        "id","societyId","paymentId","amountPaise","reason","providerReference","idempotencyKey","refundedByUserId","refundedAt"
      )
      SELECT md5('aaraagate-perf-refund-'||g)::uuid,'${ids.society}'::uuid,
             md5('aaraagate-perf-payment-'||g)::uuid,10000,'Synthetic benchmark refund',
             'perf-refund-ref-'||g,'perf-refund-'||g,'${ids.user}'::uuid,CURRENT_TIMESTAMP
      FROM generate_series(1,${exceptionCount}) AS g
      ON CONFLICT ("societyId","idempotencyKey") DO NOTHING
    `);
  } finally {
    await prisma.$executeRawUnsafe('ALTER TABLE "PaymentRefund" ENABLE TRIGGER USER');
    await prisma.$executeRawUnsafe('ALTER TABLE "ReceivableAllocationReversal" ENABLE TRIGGER USER');
    await prisma.$executeRawUnsafe('ALTER TABLE "ReceivableAllocation" ENABLE TRIGGER USER');
  }

  console.log(JSON.stringify({
    performanceSeed:true,societyId:ids.society,paymentCount,allocationCount:paymentCount,
    reversalCount:Math.min(10000,paymentCount),refundCount:Math.min(10000,paymentCount),
    boundary:'Synthetic repository-CI scale evidence only; not production accounting or capacity evidence.',
  }));
} finally {
  await prisma.$disconnect();
}
