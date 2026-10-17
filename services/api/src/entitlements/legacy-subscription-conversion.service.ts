import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthPrincipal } from '../auth/auth.types';
import { DistributionContext } from './partner-distribution.service';
import { PartnerLicenseLifecycleService, canonicalLicenseJson, sameLicenseFeatures } from './partner-license-lifecycle.service';

/** Explicit additive conversion of historical commercial rights. Never writes
 * Society, operational entitlements, invoices, payments or membership roles. */
@Injectable()
export class LegacySubscriptionConversionService {
  constructor(private readonly licenses:PartnerLicenseLifecycleService) {}
  async convert(principal:AuthPrincipal,societyId:string,input:DistributionContext) {
    return this.licenses.withActiveAllocation(principal,societyId,input,async(tx,scope)=>{
      const baseline=await tx.societyEntitlementCompatibility.findUnique({where:{societyId}});
      if(!baseline||baseline.sourceProductTier!==scope.legacy.productTier||
        canonicalLicenseJson(baseline.sourceOverrides)!==canonicalLicenseJson(scope.legacy.featureOverrides)||
        !sameLicenseFeatures(baseline.enabledFeatures,scope.legacy.enabledFeatures))throw new ConflictException('Historical legacy compatibility changed or unavailable');
      const existing=await tx.societyLegacySubscription.findFirst({where:{OR:[{allocationId:scope.allocationId},{societyId,idempotencyKey:input.idempotencyKey}]}});
      if(existing){
        if(existing.societyId!==societyId||existing.allocationId!==scope.allocationId||existing.actorId!==principal.userId||existing.idempotencyKey!==input.idempotencyKey)throw new ConflictException('Legacy conversion request changed');
        return {id:existing.id,status:'CONVERTED_PRESERVE_LEGACY' as const,operationalAuthority:'LEGACY_TIER_OVERRIDES' as const};
      }
      const row=await tx.societyLegacySubscription.create({data:{societyId,allocationId:scope.allocationId,actorId:principal.userId,idempotencyKey:input.idempotencyKey,sourceMigration:baseline.sourceMigration,
        productTier:scope.legacy.productTier,featureOverrides:scope.legacy.featureOverrides===null?Prisma.JsonNull:scope.legacy.featureOverrides,enabledFeatures:scope.legacy.enabledFeatures},select:{id:true}});
      return {...row,status:'CONVERTED_PRESERVE_LEGACY' as const,operationalAuthority:'LEGACY_TIER_OVERRIDES' as const};
    });
  }
}
