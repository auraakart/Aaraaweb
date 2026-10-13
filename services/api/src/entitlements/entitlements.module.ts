import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentEntitlementsController } from './current-entitlements.controller';
import { EntitlementService } from './entitlement.service';
import { FeatureGuard } from './feature.guard';
import { PlatformEntitlementsController } from './platform-entitlements.controller';
import { PlatformPartnerLicenseController } from './platform-partner-license.controller';
import { PartnerLicensePersistenceService } from './partner-license-persistence.service';

@Module({
  controllers: [PlatformEntitlementsController, CurrentEntitlementsController, PlatformPartnerLicenseController],
  providers: [PrismaService, EntitlementService, FeatureGuard, PartnerLicensePersistenceService],
  exports: [EntitlementService, FeatureGuard],
})
export class EntitlementsModule {}
