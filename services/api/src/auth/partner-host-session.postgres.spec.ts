import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';

const withDatabase=process.env.DATABASE_URL?describe:describe.skip;
withDatabase('V5.4.17 PostgreSQL immutable host session binding',()=>{
 it('preserves legacy sessions, rejects partial/nonpartner/FK bindings and permits credential rotation only',async()=>{
  const p=new PrismaService();
  try {
   const userId=randomUUID(),partnerId=randomUUID(),claimId=randomUUID();
   await p.user.create({data:{id:userId,phone:'host-session-'+userId}});
   await p.partner.create({data:{id:partnerId,slug:'host-session-'+partnerId,displayName:'Host session fixture',status:'ACTIVE'}});
   const hostname='p'+partnerId.replaceAll('-','')+'.partner.in';
   await p.partnerDomainClaim.create({data:{id:claimId,partnerId,hostname,
    challengeHash:'a'.repeat(64),idempotencyKey:randomUUID(),createdById:userId}});
   const data=()=>({userId,accessTokenHash:randomUUID(),refreshTokenHash:randomUUID(),
    expiresAt:new Date(Date.now()+60000),refreshExpiresAt:new Date(Date.now()+60000)});
   const legacy=await p.session.create({data:data()});
   expect(legacy.audience).toBe('STANDARD');expect(legacy.originHost).toBeNull();
   await expect(p.session.create({data:{...data(),originHost:hostname}})).rejects.toThrow();
   await expect(p.session.create({data:{...data(),originHost:hostname,hostClaimId:claimId,hostClaimVersion:1}})).rejects.toThrow();
   await expect(p.session.create({data:{...data(),audience:'PARTNER',originHost:hostname,hostClaimId:randomUUID(),hostClaimVersion:1}})).rejects.toThrow();
   await expect(p.session.create({data:{...data(),audience:'PARTNER',originHost:hostname,hostClaimId:claimId,hostClaimVersion:0}})).rejects.toThrow();
   const session=await p.session.create({data:{...data(),audience:'PARTNER',originHost:hostname,hostClaimId:claimId,hostClaimVersion:1}});
   await expect(p.session.update({where:{id:session.id},data:{originHost:'other.partner.in'}})).rejects.toThrow(/immutable/);
   await expect(p.session.update({where:{id:session.id},data:{hostClaimVersion:2}})).rejects.toThrow(/immutable/);
   await expect(p.session.update({where:{id:session.id},data:{originHost:null,hostClaimId:null,hostClaimVersion:null}})).rejects.toThrow(/immutable/);
   await expect(p.session.update({where:{id:legacy.id},data:{audience:'PARTNER',originHost:hostname,hostClaimId:claimId,hostClaimVersion:1}})).rejects.toThrow(/immutable/);
   await expect(p.session.update({where:{id:session.id},data:{accessTokenHash:randomUUID(),refreshTokenHash:randomUUID()}})).resolves.toMatchObject({originHost:hostname,hostClaimVersion:1});
   await expect(p.partnerDomainClaim.delete({where:{id:claimId}})).rejects.toThrow();
   await expect(p.session.update({where:{id:session.id},data:{revokedAt:new Date(),revocationReason:'LOGOUT'}})).resolves.toHaveProperty('revokedAt');
  } finally {await p.$disconnect();}
 });
});
