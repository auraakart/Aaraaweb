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
import { PartnerPortfolioReadController } from './partner-portfolio-read.controller';
import { PartnerPortfolioReadService } from './partner-portfolio-read.service';

@Module({
  controllers: [PlatformOwnershipTransferController, PlatformEntitlementsController, CurrentEntitlementsController, PlatformPartnerLicenseController, PartnerPortfolioReadController],
  providers: [SocietyOwnershipTransferService, PrismaService, EntitlementService, FeatureGuard, PartnerLicensePersistenceService, PartnerPortfolioReadService],
  exports: [EntitlementService, FeatureGuard],
})
export class EntitlementsModule {}
