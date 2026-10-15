import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma=new PrismaClient();
const hash=(value)=>createHash('sha256').update(value).digest('hex');

const ids={
  society:'11111111-1111-4111-8111-111111118001',
  building:'11111111-1111-4111-8111-111111118002',
  unit:'11111111-1111-4111-8111-111111118003',
  gate:'11111111-1111-4111-8111-111111118004',
  resident:'11111111-1111-4111-8111-111111118011',
  guard:'11111111-1111-4111-8111-111111118012',
  admin:'11111111-1111-4111-8111-111111118013',
  residentMembership:'11111111-1111-4111-8111-111111118021',
  guardMembership:'11111111-1111-4111-8111-111111118022',
  adminMembership:'11111111-1111-4111-8111-111111118023',
  occupancy:'11111111-1111-4111-8111-111111118031',
  gateAssignment:'11111111-1111-4111-8111-111111118032',
  residentSession:'11111111-1111-4111-8111-111111118041',
  guardSession:'11111111-1111-4111-8111-111111118042',
  adminSession:'11111111-1111-4111-8111-111111118043',
};
const tokens={
  resident:process.env.AARAAGATE_E2E_RESIDENT_TOKEN??'aaraagate-e2e-resident-token',
  guard:process.env.AARAAGATE_E2E_GUARD_TOKEN??'aaraagate-e2e-guard-token',
  admin:process.env.AARAAGATE_E2E_ADMIN_TOKEN??'aaraagate-e2e-admin-token',
};

async function upsertUser(id,phone,name){
  await prisma.user.upsert({where:{id},create:{id,phone,name,status:'ACTIVE'},update:{phone,name,status:'ACTIVE'}});
}
async function upsertMembership(id,userId,role){
  await prisma.societyMembership.upsert({
    where:{id},
    create:{id,userId,societyId:ids.society,role,active:true},
    update:{userId,societyId:ids.society,role,active:true},
  });
}
async function upsertSession(id,userId,token,refresh){
  await prisma.session.upsert({
    where:{id},
    create:{id,userId,societyId:ids.society,accessTokenHash:hash(token),refreshTokenHash:hash(refresh),expiresAt:new Date(Date.now()+60*60*1000),refreshExpiresAt:new Date(Date.now()+24*60*60*1000),revokedAt:null,revocationReason:null},
    update:{userId,societyId:ids.society,accessTokenHash:hash(token),refreshTokenHash:hash(refresh),expiresAt:new Date(Date.now()+60*60*1000),refreshExpiresAt:new Date(Date.now()+24*60*60*1000),revokedAt:null,revocationReason:null},
  });
}

try{
  await prisma.society.upsert({
    where:{id:ids.society},
    create:{id:ids.society,name:'Aaraagate E2E Society',code:'E2E8001',status:'ACTIVE',productTier:'ENTERPRISE',featureOverrides:{VISITOR_MANAGEMENT:true,ADVANCED_REPORTS:true}},
    update:{name:'Aaraagate E2E Society',status:'ACTIVE',productTier:'ENTERPRISE',featureOverrides:{VISITOR_MANAGEMENT:true,ADVANCED_REPORTS:true}},
  });
  await prisma.building.upsert({
    where:{id:ids.building},
    create:{id:ids.building,societyId:ids.society,name:'E2E Tower',code:'E2E-T'},
    update:{societyId:ids.society,name:'E2E Tower',code:'E2E-T'},
  });
  await prisma.unit.upsert({
    where:{id:ids.unit},
    create:{id:ids.unit,societyId:ids.society,buildingId:ids.building,number:'E2E-101'},
    update:{societyId:ids.society,buildingId:ids.building,number:'E2E-101'},
  });
  await prisma.gate.upsert({
    where:{id:ids.gate},
    create:{id:ids.gate,societyId:ids.society,name:'E2E Main Gate',code:'E2E-G1',active:true},
    update:{societyId:ids.society,name:'E2E Main Gate',code:'E2E-G1',active:true},
  });

  await upsertUser(ids.resident,'+919999998011','E2E Resident');
  await upsertUser(ids.guard,'+919999998012','E2E Guard');
  await upsertUser(ids.admin,'+919999998013','E2E Admin');
  await upsertMembership(ids.residentMembership,ids.resident,'OWNER');
  await upsertMembership(ids.guardMembership,ids.guard,'SECURITY_GUARD');
  await upsertMembership(ids.adminMembership,ids.admin,'SOCIETY_ADMIN');

  await prisma.unitOccupancy.upsert({
    where:{id:ids.occupancy},
    create:{id:ids.occupancy,societyId:ids.society,unitId:ids.unit,userId:ids.resident,relation:'OWNER',effectiveFrom:new Date(Date.now()-24*60*60*1000),effectiveTo:null,active:true,primaryGateContact:true,gateApprovalEnabled:true,gateNotificationEnabled:true,escalationOrder:1},
    update:{societyId:ids.society,unitId:ids.unit,userId:ids.resident,relation:'OWNER',effectiveFrom:new Date(Date.now()-24*60*60*1000),effectiveTo:null,active:true,primaryGateContact:true,gateApprovalEnabled:true,gateNotificationEnabled:true,escalationOrder:1},
  });
  await prisma.gateGuardAssignment.upsert({
    where:{id:ids.gateAssignment},
    create:{id:ids.gateAssignment,societyId:ids.society,gateId:ids.gate,userId:ids.guard,effectiveFrom:new Date(Date.now()-24*60*60*1000),effectiveTo:null,active:true},
    update:{societyId:ids.society,gateId:ids.gate,userId:ids.guard,effectiveFrom:new Date(Date.now()-24*60*60*1000),effectiveTo:null,active:true},
  });

  await upsertSession(ids.residentSession,ids.resident,tokens.resident,'aaraagate-e2e-resident-refresh');
  await upsertSession(ids.guardSession,ids.guard,tokens.guard,'aaraagate-e2e-guard-refresh');
  await upsertSession(ids.adminSession,ids.admin,tokens.admin,'aaraagate-e2e-admin-refresh');

  console.log(JSON.stringify({societyId:ids.society,unitId:ids.unit,gateId:ids.gate}));
} finally {
  await prisma.$disconnect();
}
