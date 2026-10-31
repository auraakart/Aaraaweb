import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { operationalPerformance as contract } from '../../../scripts/lib/operational-performance-contract.mjs';

export async function seedOperationalPerformance(prisma,{society,unit}) {
  const hash=value=>createHash('sha256').update(value).digest('hex');
  await prisma.user.upsert({where:{id:contract.userId},create:{id:contract.userId,phone:'+919999999902',name:'Performance CI Society Operator',status:'ACTIVE'},update:{status:'ACTIVE'}});
  await prisma.societyMembership.upsert({where:{id:contract.membershipId},create:{id:contract.membershipId,userId:contract.userId,societyId:society,role:'SOCIETY_ADMIN',active:true},update:{userId:contract.userId,societyId:society,role:'SOCIETY_ADMIN',active:true}});
  const session={userId:contract.userId,societyId:society,accessTokenHash:hash(process.env.AARAAGATE_PERF_OPERATIONS_ACCESS_TOKEN??contract.accessToken),refreshTokenHash:hash(contract.refreshToken),expiresAt:new Date(Date.now()+3_600_000),refreshExpiresAt:new Date(Date.now()+86_400_000),revokedAt:null,revocationReason:null};
  await prisma.session.upsert({where:{id:contract.sessionId},create:{id:contract.sessionId,...session},update:session});
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "OccupancyLifecycleRequest" ("id","societyId","unitId","userId","kind","relation","status","effectiveAt","requestedByUserId","reviewedByUserId","createdAt")
    SELECT md5(${contract.requestPrefix}||g)::uuid,${society}::uuid,${unit}::uuid,${contract.userId}::uuid,
      'MOVE_IN','OWNER'::"UnitRelation",'COMPLETED',CURRENT_TIMESTAMP-INTERVAL '1 day',${contract.userId}::uuid,${contract.userId}::uuid,CURRENT_TIMESTAMP-g*INTERVAL '1 minute'
    FROM generate_series(1,${contract.requestCount}) g ON CONFLICT ("id") DO NOTHING`);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "SocietyDocument" ("id","societyId","category","audience","title","storageKey","fileName","mimeType","sizeBytes","status","uploadedByUserId","publishedByUserId","publishedAt","createdAt")
    SELECT md5(${contract.documentPrefix}||g)::uuid,${society}::uuid,'POLICY','ALL_MEMBERS','Synthetic policy '||g,
      'societies/'||${society}||'/documents/performance-'||g||'.pdf','policy.pdf','application/pdf',1000,'PUBLISHED',${contract.userId}::uuid,${contract.userId}::uuid,CURRENT_TIMESTAMP-g*INTERVAL '1 minute',CURRENT_TIMESTAMP-g*INTERVAL '1 minute'
    FROM generate_series(1,${contract.documentCount}) g ON CONFLICT ("id") DO NOTHING`);
  await prisma.$executeRaw(Prisma.sql`ANALYZE "OccupancyLifecycleRequest"`);
  await prisma.$executeRaw(Prisma.sql`ANALYZE "SocietyDocument"`);
  const requestPlan=await prisma.$queryRaw(Prisma.sql`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT r."id",r."unitId",r."userId",r."occupancyId",r."kind",r."relation",r."status",r."effectiveAt",r."reason",r."requestedByUserId",r."reviewedByUserId",r."reviewedAt",r."completedAt",r."createdAt",r."updatedAt"
    FROM "OccupancyLifecycleRequest" r WHERE r."societyId"=${society}::uuid
      AND EXISTS(SELECT 1 FROM "Unit" u JOIN "Building" b ON b."id"=u."buildingId" WHERE u."id"=r."unitId" AND u."societyId"=${society}::uuid AND b."societyId"=${society}::uuid)
    ORDER BY r."createdAt" DESC LIMIT 250`);
  const documentPlan=await prisma.$queryRaw(Prisma.sql`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT d.*,EXISTS(SELECT 1 FROM "SocietyDocumentKnowledge" k WHERE k."documentId"=d."id" AND k."societyId"=d."societyId") AS "knowledgeAvailable",u."number" AS "unitNumber",b."name" AS "buildingName"
    FROM "SocietyDocument" d LEFT JOIN "Unit" u ON u."id"=d."unitId" AND u."societyId"=d."societyId"
    LEFT JOIN "Building" b ON b."id"=u."buildingId" AND b."societyId"=d."societyId"
    WHERE d."societyId"=${society}::uuid AND(d."unitId" IS NULL OR EXISTS(SELECT 1 FROM "Unit" du JOIN "Building" db ON db."id"=du."buildingId" WHERE du."id"=d."unitId" AND du."societyId"=d."societyId" AND db."societyId"=d."societyId")) ORDER BY d."createdAt" DESC`);
  const direct=[],scoped=[];
  const read=tx=>tx.$queryRaw(Prisma.sql`SELECT "id" FROM "OccupancyLifecycleRequest" WHERE "societyId"=${society}::uuid ORDER BY "createdAt" DESC LIMIT 1`);
  for(let sample=0;sample<20;sample++) {
    const directRead=async()=>{const started=performance.now();await read(prisma);direct.push(performance.now()-started);};
    const scopedRead=async()=>{const started=performance.now();await prisma.$transaction(async tx=>{await tx.$queryRaw(Prisma.sql`SELECT set_config('app.aaraagate_society_id',${society},true)`);await read(tx);});scoped.push(performance.now()-started);};
    if(sample%2){await scopedRead();await directRead();}else{await directRead();await scopedRead();}
  }
  const summary=values=>{const sorted=[...values].sort((a,b)=>a-b);return{samples:sorted.length,p50Ms:Number(sorted[Math.ceil(sorted.length*.5)-1].toFixed(3)),p95Ms:Number(sorted[Math.ceil(sorted.length*.95)-1].toFixed(3))};};
  const evidence={requestCount:contract.requestCount,documentCount:contract.documentCount,requestPlan,documentPlan,transactionTiming:{direct:summary(direct),tenantTransaction:summary(scoped),boundary:'Alternating owner-role CI client samples; not restricted-runtime, production or optimization evidence.'}};
  await writeFile(process.env.AARAAGATE_PERF_QUERY_PLAN_OUTPUT??'/tmp/aaraagate-operational-query-plans.json',JSON.stringify(evidence,null,2));
  return{requestCount:contract.requestCount,documentCount:contract.documentCount};
}
