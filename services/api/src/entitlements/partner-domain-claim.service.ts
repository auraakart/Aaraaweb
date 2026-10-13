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
}
