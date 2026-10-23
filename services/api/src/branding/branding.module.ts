import { PartnerReadinessService } from './partner-readiness.service';
import { PartnerReadinessController } from './partner-readiness.controller';
import { PartnerApplicationService } from './partner-application.service';
import { PartnerApplicationController, ApplicationScopeController } from './partner-application.controller';
import { PartnerBrandService } from './partner-brand.service';
import { PartnerBrandController } from './partner-brand.controller';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { BrandingController, BrandingContextController, BrandingManageController } from './branding.controller';
import { BrandingService } from './branding.service';
import { BrandLogoController } from './brand-logo.controller';
import { BrandLogoReadController } from './brand-logo-read.controller';
import { PublishedBrandLogoService } from './brand-logo-read.service';
import { BrandLogoService, SOCIETY_LOGO_SCANNER } from './brand-logo.service';
import { PrivateObjectStorageModule } from '../storage/private-object-storage.module';
import { PRIVATE_OBJECT_STORAGE, ObjectStoragePort } from '../services-marketplace/object-storage.port';
import { createMediaSafetyScannerFromEnv } from '../services-marketplace/clamav-media-safety-scanner.adapter';
import { PrismaMembershipRepository } from '../auth/prisma-membership.repository';

@Module({
  imports: [AuthModule, EntitlementsModule, PrivateObjectStorageModule],
  controllers: [PartnerReadinessController, PartnerApplicationController, ApplicationScopeController, PartnerBrandController, BrandingController, BrandingContextController, BrandingManageController, BrandLogoController, BrandLogoReadController],
  exports: [BrandingService],
  providers: [
    PrismaService, PartnerReadinessService, PartnerApplicationService, PartnerBrandService, BrandingService, BrandLogoService, PublishedBrandLogoService, PrismaMembershipRepository,
    {
      provide: SOCIETY_LOGO_SCANNER,
      inject: [PRIVATE_OBJECT_STORAGE],
      useFactory: (storage: ObjectStoragePort) => createMediaSafetyScannerFromEnv(storage),
    },
  ],
})
export class BrandingModule {}
