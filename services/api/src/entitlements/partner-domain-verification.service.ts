import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { PartnerDomainClaimAction, PartnerDomainClaimStatus, PartnerRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const challengePattern=/^[0-9a-f]{64}$/;
const CLAIM_TTL_MS=7*24*60*60*1000;
const VERIFY_TTL_MS=30*24*60*60*1000;
const RETRY_MS=60*1000;
const MAX_ATTEMPTS=5;

/**
 * Non-production only: a DNS TXT proof is not partner, society, session or
 * distribution authorization. We never expose VERIFIED records to Host routing.
 */
@Injectable()
export class PartnerDomainVerificationService {
  constructor(private readonly prisma:PrismaService) {}
  private enabled() {
    return ['development','test'].includes(process.env.NODE_ENV??'') &&
      process.env.AARAGATE_ENABLE_TEST_DOMAIN_VERIFICATION==='true';
  }
  private async authority(tx:Prisma.TransactionClient,actorId:string,partnerId:string) {
    const rows=await tx.$queryRaw<{id:string;status:string}[]>`SELECT "id","status" FROM "Partner" WHERE "id"=${partnerId}::uuid FOR UPDATE`;
    if(rows.length!==1||rows[0].status!=='ACTIVE')throw new NotFoundException('Partner resource unavailable');
    const membership=await tx.partnerMembership.findFirst({
      where:{partnerId,userId:actorId,role:PartnerRole.OWNER,active:true,user:{is:{status:'ACTIVE'}}},
      select:{id:true},
    });
    if(!membership)throw new NotFoundException('Partner resource unavailable');
  }
  private async claim(tx:Prisma.TransactionClient,partnerId:string,claimId:string,now:Date) {
    await tx.$queryRaw`SELECT "id" FROM "PartnerDomainClaim" WHERE "id"=${claimId}::uuid AND "partnerId"=${partnerId}::uuid FOR UPDATE`;
    const claim=await tx.partnerDomainClaim.findFirst({where:{id:claimId,partnerId}});
    if(!claim)throw new NotFoundException('Partner domain claim unavailable');
    if(claim.status!==PartnerDomainClaimStatus.PENDING)throw new ConflictException('Domain claim already processed');
    if(claim.createdAt.getTime()>now.getTime() ||
       now.getTime()-claim.createdAt.getTime()>=CLAIM_TTL_MS)
      throw new ConflictException('Domain challenge expired');
    return claim;
  }
  async verify(actorId:string,partnerId:string,claimId:string,challenge:string) {
    if(!this.enabled())throw new NotFoundException('Domain verifier disabled');
    if(typeof challenge!=='string'||!challengePattern.test(challenge))
      throw new BadRequestException('Invalid proof token');
    const now=new Date();
    // Reserve an attempt in a short transaction; never hold a DB lock over DNS.
    const pre=await this.prisma.$transaction(async tx=>{
      await this.authority(tx,actorId,partnerId);
      const row=await this.claim(tx,partnerId,claimId,now);
      if(row.verificationAttempts>=MAX_ATTEMPTS ||
         (row.lastVerificationAttemptAt&&now.getTime()-row.lastVerificationAttemptAt.getTime()<RETRY_MS))
        throw new ConflictException('Domain verification attempt limit');
      const version=row.version+1;
      await tx.partnerDomainClaim.update({
        where:{id:row.id},data:{verificationAttempts:{increment:1},lastVerificationAttemptAt:now,version},
      });
      const expected=Buffer.from(row.challengeHash,'hex');
      const supplied=createHash('sha256').update(challenge).digest();
      return {hostname:row.hostname,version,tokenMatches:expected.length===32&&timingSafeEqual(expected,supplied)};
    });
    if(!pre.tokenMatches)throw new ConflictException('Domain proof mismatch');
    const txtHost='_aaraagate-challenge.'+pre.hostname;
    if(txtHost.length>253)throw new ConflictException('Domain hostname too long to verify');
    let records:string[][];
    try {records=await resolveTxt(txtHost);}
    catch {throw new ConflictException('DNS TXT proof not available');}
    const expectedTxt='aaraagate-domain-verification='+challenge;
    if(!Array.isArray(records)||records.length>10 ||
       !records.some(parts=>Array.isArray(parts)&&parts.length<=10&&
         parts.every(part=>typeof part==='string'&&part.length<=255)&&
         parts.join('')===expectedTxt))
      throw new ConflictException('DNS TXT proof mismatch');
    // Recheck every authority, license and claim fact after DNS; a second
    // attempt or concurrent partner change invalidates the earlier lookup.
    return this.prisma.$transaction(async tx=>{
      await this.authority(tx,actorId,partnerId);
      const current=new Date(),claim=await this.claim(tx,partnerId,claimId,current);
      if(claim.version!==pre.version||claim.verificationAttempts>MAX_ATTEMPTS)
        throw new ConflictException('Domain proof context changed');
      const grants=await tx.partnerLicenseGrant.findMany({
        where:{partnerId,startsAt:{lte:current},endsAt:{gt:current},
          approval:{is:{revocation:null}}},
        select:{id:true,version:true,approval:{select:{grantVersion:true}},
          planRevision:{select:{maximumDomains:true}}},
        take:2,
      });
      if(grants.length!==1||grants[0].approval?.grantVersion!==grants[0].version ||
         grants[0].planRevision.maximumDomains<=0)
        throw new ConflictException('Current approved domain license unavailable');
      const used=await tx.partnerDomainClaim.count({
        where:{partnerId,status:PartnerDomainClaimStatus.VERIFIED,verifiedUntil:{gt:current}},
      });
      if(used>=grants[0].planRevision.maximumDomains)
        throw new ConflictException('Licensed domain capacity reached');
      const until=new Date(current.getTime()+VERIFY_TTL_MS);
      await tx.partnerDomainClaim.update({
        where:{id:claimId},data:{status:PartnerDomainClaimStatus.VERIFIED,verifiedAt:current,verifiedUntil:until,version:{increment:1}},
      });
      await tx.partnerDomainClaimEvent.create({data:{
        claimId,actorId,action:PartnerDomainClaimAction.VERIFIED,
      }});
      return {id:claimId,hostname:claim.hostname,status:'VERIFIED' as const,verifiedUntil:until.toISOString(),
        routingActivated:false as const};
    });
  }
}
