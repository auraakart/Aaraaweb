import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerServiceRatingsService } from './consumer-service-ratings.service';

export type ReviewedProviderQualityTier='STANDARD'|'TRUSTED'|'PREMIUM';

@Injectable()
export class ProviderTrustReviewService{
  constructor(private readonly prisma:PrismaService,private readonly ratings:ConsumerServiceRatingsService){}

  async listRecommendations(){
    const earned=await this.ratings.providerTrustSummaries();
    if(!earned.length)return [];
    const ids=earned.map(x=>x.providerId);
    const rows=await this.prisma.$queryRaw<Array<{providerId:string;businessName:string;qualityTier:ReviewedProviderQualityTier;qualityNote:string|null;reviewedByUserId:string|null;reviewedAt:Date|null}>>(Prisma.sql`
      SELECT p."id" AS "providerId",p."businessName",
        COALESCE(t."qualityTier",'STANDARD'::"ProviderQualityTier")::text AS "qualityTier",
        t."qualityNote",t."reviewedByUserId",t."reviewedAt"
      FROM "ServiceProvider" p
      LEFT JOIN "ServiceProviderTrustProfile" t ON t."providerId"=p."id"
      WHERE p."id" IN (${Prisma.join(ids.map(id=>Prisma.sql`${id}::uuid`))})
    `);
    const byId=new Map(rows.map(row=>[row.providerId,row]));
    return earned.map(signal=>{
      const current=byId.get(signal.providerId);
      return {...signal,businessName:current?.businessName??'',currentQualityTier:current?.qualityTier??'STANDARD',qualityNote:current?.qualityNote??null,reviewedByUserId:current?.reviewedByUserId??null,reviewedAt:current?.reviewedAt??null,reviewNeeded:(current?.qualityTier??'STANDARD')!==signal.earnedQualityTier};
    });
  }

  async setReviewedTier(providerId:string,reviewerUserId:string,tier:ReviewedProviderQualityTier,note:string){
    const why=note.trim();if(!why)throw new BadRequestException('Trust review note is required');if(why.length>1000)throw new BadRequestException('Trust review note must be 1000 characters or fewer');
    const provider=await this.prisma.serviceProvider.findUnique({where:{id:providerId},select:{id:true,verification:true,active:true}});
    if(!provider)throw new NotFoundException('Service provider not found');
    if(provider.verification!=='VERIFIED'||!provider.active)throw new BadRequestException('Only active verified providers can receive a reviewed trust tier');
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "ServiceProviderTrustProfile" ("providerId","qualityTier","qualityNote","reviewedByUserId","reviewedAt","createdAt","updatedAt")
      VALUES (${providerId}::uuid,${tier}::"ProviderQualityTier",${why},${reviewerUserId}::uuid,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT ("providerId") DO UPDATE SET "qualityTier"=EXCLUDED."qualityTier","qualityNote"=EXCLUDED."qualityNote","reviewedByUserId"=EXCLUDED."reviewedByUserId","reviewedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
    `);
    return this.get(providerId);
  }

  async get(providerId:string){const recommendations=await this.listRecommendations();const found=recommendations.find(x=>x.providerId===providerId);if(!found)throw new NotFoundException('Active verified provider trust recommendation not found');return found;}
}
