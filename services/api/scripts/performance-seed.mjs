import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma=new PrismaClient();
const hash=(value)=>createHash('sha256').update(value).digest('hex');

const userId='11111111-1111-4111-8111-111111119901';
const sessionId='22222222-2222-4222-8222-222222229901';
const accessToken=process.env.AARAAGATE_PERF_ACCESS_TOKEN??'aaraagate-perf-access-token-local-ci';
const refreshToken=process.env.AARAAGATE_PERF_REFRESH_TOKEN??'aaraagate-perf-refresh-token-local-ci';

try{
  await prisma.user.upsert({
    where:{id:userId},
    create:{id:userId,phone:'+919999999901',name:'Performance CI User',status:'ACTIVE'},
    update:{phone:'+919999999901',name:'Performance CI User',status:'ACTIVE'},
  });
  await prisma.session.upsert({
    where:{id:sessionId},
    create:{
      id:sessionId,
      userId,
      societyId:null,
      accessTokenHash:hash(accessToken),
      refreshTokenHash:hash(refreshToken),
      expiresAt:new Date(Date.now()+60*60*1000),
      refreshExpiresAt:new Date(Date.now()+24*60*60*1000),
      revokedAt:null,
      revocationReason:null,
    },
    update:{
      userId,
      societyId:null,
      accessTokenHash:hash(accessToken),
      refreshTokenHash:hash(refreshToken),
      expiresAt:new Date(Date.now()+60*60*1000),
      refreshExpiresAt:new Date(Date.now()+24*60*60*1000),
      revokedAt:null,
      revocationReason:null,
    },
  });
  console.log('Performance seed ready: one active society-less session.');
} finally {
  await prisma.$disconnect();
}
