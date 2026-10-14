import { PartnerDistributionController } from './partner-distribution.controller';
import { PartnerDistributionService } from './partner-distribution.service';
import { LegacySubscriptionConversionService } from './legacy-subscription-conversion.service';
import { PartnerLicenseOverviewController } from './partner-license-overview.controller';
import { PartnerLicenseOverviewService } from './partner-license-overview.service';
import { PartnerLicenseLifecycleController } from './partner-license-lifecycle.controller';
import { PartnerLicenseLifecycleService } from './partner-license-lifecycle.service';
import { PartnerCapacityReservationService } from './partner-capacity-reservation.service';
import { PlatformCapacityReservationController } from './platform-capacity-reservation.controller';
import { PlatformOwnershipTransferController } from './platform-ownership-transfer.controller';
import { SocietyOwnershipTransferService } from './society-ownership-transfer.service';
import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentEntitlementsController } from './current-entitlements.controller';
import { EntitlementService } from './entitlement.service';
import { FeatureGuard } from './feature.guard';
import { PlatformEntitlementsController } from './platform-entitlements.controller';
import { PlatformPartnerLicenseController } from './platform-partner-license.controller';
import { PartnerLicensePersistenceService } from './partner-license-persistence.service';
import { PartnerMemberLifecycleController } from './partner-member-lifecycle.controller';
import { PartnerMemberLifecycleService } from './partner-member-lifecycle.service';
import { PartnerPortfolioReadController } from './partner-portfolio-read.controller';
import { PartnerDomainClaimController } from './partner-domain-claim.controller';
import { PartnerDomainClaimService } from './partner-domain-claim.service';
import { PartnerDomainVerificationService } from './partner-domain-verification.service';
import { PartnerPortfolioReadService } from './partner-portfolio-read.service';

@Module({
  controllers: [PartnerDistributionController, PartnerLicenseOverviewController, PartnerLicenseLifecycleController, PlatformCapacityReservationController, PlatformOwnershipTransferController, PlatformEntitlementsController, CurrentEntitlementsController, PlatformPartnerLicenseController, PartnerPortfolioReadController, PartnerMemberLifecycleController, PartnerDomainClaimController],
  providers: [PartnerDistributionService, LegacySubscriptionConversionService, PartnerLicenseOverviewService, PartnerLicenseLifecycleService, PartnerCapacityReservationService, SocietyOwnershipTransferService, PrismaService, EntitlementService, FeatureGuard, PartnerLicensePersistenceService, PartnerPortfolioReadService, PartnerMemberLifecycleService, PartnerDomainClaimService, PartnerDomainVerificationService],
  exports: [EntitlementService, FeatureGuard],
})
export class EntitlementsModule {}
