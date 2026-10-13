import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PartnerDomainClaimAction, PartnerRole, Prisma } from '@prisma/client';
import { loadPartnerDomainContract } from '@aaraagate/config/partner-domain-loader';
import { PrismaService } from '../prisma/prisma.service';

/** Inert hostname claims only. Neither HTTP Host nor claim status is a permission. */
@Injectable()
export class PartnerDomainClaimService {
  constructor(private readonly prisma: PrismaService) {}

  private async canonical(value: string) {
    let reservedHostnames: string[];
    try {
      const parsed: unknown = JSON.parse(process.env.AARAGATE_PLATFORM_HOSTNAMES ?? '[]');
      if (!Array.isArray(parsed) || parsed.length > 50 || parsed.some(v => typeof v !== 'string')) throw Error();
      reservedHostnames = parsed as string[];
    } catch { throw new ConflictException('Platform hostname reservation configuration invalid'); }
    try {
      const contract = await loadPartnerDomainContract();
      return contract.normalizePartnerDomainHostname(value, {reservedHostnames});
    } catch { throw new BadRequestException('Invalid or reserved partner hostname'); }
  }

  private async authority(tx: Prisma.TransactionClient, actorId: string, partnerId: string) {
    // Partner writes also lock this row, making owner revocations serialize.
    const partners = await tx.$queryRaw<{id:string;status:string}[]>`SELECT "id","status" FROM "Partner" WHERE "id"=${partnerId}::uuid FOR UPDATE`;
    if (partners.length !== 1 || partners[0].status !== 'ACTIVE') throw new NotFoundException('Partner resource unavailable');
    const owner = await tx.partnerMembership.findFirst({
      where: {partnerId,userId:actorId,role:PartnerRole.OWNER,active:true,user:{is:{status:'ACTIVE'}}},
      select:{id:true},
    });
    if (!owner) throw new NotFoundException('Partner resource unavailable');
  }

  async list(actorId:string,partnerId:string) {
    return this.prisma.$transaction(async tx => {
      await this.authority(tx,actorId,partnerId);
      const rows = await tx.partnerDomainClaim.findMany({
        where:{partnerId},
        select:{id:true,hostname:true,status:true,createdAt:true,version:true},
        orderBy:{createdAt:'asc'},take:51,
      });
      return {claims:rows.slice(0,50),hasMore:rows.length>50};
    });
  }

  async register(actorId:string,partnerId:string,input:{hostname:string;idempotencyKey:string}) {
    const hostname=await this.canonical(input.hostname);
    try {
      return await this.prisma.$transaction(async tx => {
        await this.authority(tx,actorId,partnerId);
        const replay=await tx.partnerDomainClaim.findUnique({
          where:{partnerId_idempotencyKey:{partnerId,idempotencyKey:input.idempotencyKey}},
          select:{id:true,hostname:true,status:true,createdById:true},
        });
        if (replay) {
          if (replay.hostname!==hostname || replay.createdById!==actorId) throw new ConflictException('Domain claim key already used');
          // The DNS challenge is deliberately not persisted in plaintext.
          return {id:replay.id,hostname:replay.hostname,status:replay.status,challenge:null,replayed:true};
        }
        const count=await tx.partnerDomainClaim.count({where:{partnerId}});
        if (count>=5) throw new ConflictException('Partner domain claim limit reached');
        // Cryptographically random proof; only its SHA-256 digest is stored.
        const challenge=randomBytes(32).toString('hex');
        const claim=await tx.partnerDomainClaim.create({
          data:{partnerId,hostname,idempotencyKey:input.idempotencyKey,createdById:actorId,
            challengeHash:createHash('sha256').update(challenge).digest('hex')},
          select:{id:true,hostname:true,status:true},
        });
        await tx.partnerDomainClaimEvent.create({data:{
          claimId:claim.id,actorId,action:PartnerDomainClaimAction.REGISTERED,
        }});
        return {...claim,challenge,replayed:false};
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code==='P2002')
        throw new ConflictException('Partner hostname or idempotency key already registered');
      throw error;
    }
  }

  /** Serial, current owner authority and claim state — never a hostname-based role. */
  private async ownedClaim(tx:Prisma.TransactionClient,actorId:string,partnerId:string,claimId:string){
    await this.authority(tx,actorId,partnerId);
    await tx.$queryRaw`SELECT "id" FROM "PartnerDomainClaim" WHERE "id"=${claimId}::uuid AND "partnerId"=${partnerId}::uuid FOR UPDATE`;
    const claim=await tx.partnerDomainClaim.findFirst({where:{id:claimId,partnerId}});
    if(!claim)throw new NotFoundException('Partner domain claim unavailable');
    return claim;
  }
  private lifecycleInput(input:{expectedVersion:number;idempotencyKey:string;reason:string}){
    if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<1||
       typeof input.idempotencyKey!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.idempotencyKey)||
       typeof input.reason!=='string'||input.reason.trim().length<3||input.reason.trim().length>500)
       throw new BadRequestException('Invalid domain lifecycle request');
    return input.reason.trim();
  }
  private async replay(tx:Prisma.TransactionClient,claimId:string,key:string){
    return tx.partnerDomainClaimEvent.findFirst({where:{claimId,idempotencyKey:key},select:{actorId:true,action:true,reason:true,resultVersion:true}});
  }
  async revoke(actorId:string,partnerId:string,claimId:string,input:{expectedVersion:number;idempotencyKey:string;reason:string}){
    const reason=this.lifecycleInput(input);
    return this.prisma.$transaction(async tx=>{
      const claim=await this.ownedClaim(tx,actorId,partnerId,claimId);
      const existing=await this.replay(tx,claimId,input.idempotencyKey);
      if(existing){
        if(existing.action!==PartnerDomainClaimAction.REVOKED||existing.actorId!==actorId||
           existing.reason!==reason||claim.status!=='REVOKED'||existing.resultVersion!==claim.version)
          throw new ConflictException('Domain action replay changed or superseded');
        return {id:claimId,status:'REVOKED' as const,replayed:true};
      }
      if(claim.version!==input.expectedVersion||claim.status==='REVOKED')
        throw new ConflictException('Domain claim version changed');
      await tx.partnerDomainClaim.update({where:{id:claimId},data:{
        status:'REVOKED',verifiedAt:null,verifiedUntil:null,version:{increment:1},
      }});
      await tx.partnerDomainClaimEvent.create({data:{
        claimId,actorId,action:PartnerDomainClaimAction.REVOKED,idempotencyKey:input.idempotencyKey,reason,resultVersion:claim.version+1,
      }});
      return {id:claimId,status:'REVOKED' as const,replayed:false};
    });
  }
  async reissue(actorId:string,partnerId:string,claimId:string,input:{expectedVersion:number;idempotencyKey:string;reason:string}){
    const reason=this.lifecycleInput(input);
    return this.prisma.$transaction(async tx=>{
      const claim=await this.ownedClaim(tx,actorId,partnerId,claimId);
      const existing=await this.replay(tx,claimId,input.idempotencyKey);
      if(existing){
        if(existing.action!==PartnerDomainClaimAction.CHALLENGE_REISSUED||existing.actorId!==actorId||
           existing.reason!==reason||claim.status!=='PENDING'||existing.resultVersion!==claim.version)
          throw new ConflictException('Domain action replay changed or superseded');
        return {id:claimId,status:'PENDING' as const,challenge:null,replayed:true};
      }
      if(claim.version!==input.expectedVersion||claim.challengeRotationCount>=10)
        throw new ConflictException('Domain claim version or rotation limit reached');
      const now=new Date();
      // At least one minute between reissues; persistent lifetime cap avoids
      // resetting DNS proof retries indefinitely.
      if(claim.challengeIssuedAt.getTime()>now.getTime()||
         now.getTime()-claim.challengeIssuedAt.getTime()<60_000)
        throw new ConflictException('Domain challenge rotation cooldown');
      const challenge=randomBytes(32).toString('hex');
      await tx.partnerDomainClaim.update({where:{id:claimId},data:{
        status:'PENDING',challengeHash:createHash('sha256').update(challenge).digest('hex'),
        challengeIssuedAt:now,challengeRotationCount:{increment:1},
        verificationAttempts:0,lastVerificationAttemptAt:null,
        verifiedAt:null,verifiedUntil:null,version:{increment:1},
      }});
      await tx.partnerDomainClaimEvent.create({data:{
        claimId,actorId,action:PartnerDomainClaimAction.CHALLENGE_REISSUED,
        idempotencyKey:input.idempotencyKey,reason,resultVersion:claim.version+1,
      }});
      return {id:claimId,status:'PENDING' as const,challenge,replayed:false};
    });
  }
}
