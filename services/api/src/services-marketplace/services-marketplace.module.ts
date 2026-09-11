import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { createMediaSafetyScannerFromEnv } from './clamav-media-safety-scanner.adapter';
import { ConsumerAvailabilityService } from './consumer-availability.service';
import { ConsumerBookingsController } from './consumer-bookings.controller';
import { ConsumerBookingsService } from './consumer-bookings.service';
import { ConsumerCommercialDiscoveryController } from './consumer-commercial-discovery.controller';
import { ConsumerCommercialDiscoveryService } from './consumer-commercial-discovery.service';
import { ConsumerDispatchPlatformController } from './consumer-dispatch-platform.controller';
import { ConsumerDispatchService } from './consumer-dispatch.service';
import { ConsumerFulfilmentService } from './consumer-fulfilment.service';
import { ConsumerOffersController } from './consumer-offers.controller';
import { ConsumerOffersService } from './consumer-offers.service';
import { ConsumerPaymentsService } from './consumer-payments.service';
import { ConsumerProviderAgentController } from './consumer-provider-agent.controller';
import { ConsumerProviderAgentPlatformController } from './consumer-provider-agent-platform.controller';
import { ConsumerProviderAgentService } from './consumer-provider-agent.service';
import { ConsumerProviderExperienceController } from './consumer-provider-experience.controller';
import { ConsumerProviderExperienceService } from './consumer-provider-experience.service';
import { ConsumerProviderMediaController } from './consumer-provider-media.controller';
import { ConsumerProviderOperatorController } from './consumer-provider-operator.controller';
import { ConsumerProviderOperatorPlatformController } from './consumer-provider-operator-platform.controller';
import { ConsumerProviderOperatorService } from './consumer-provider-operator.service';
import { ConsumerServiceCompletionService } from './consumer-service-completion.service';
import { ConsumerServiceLocationPlatformController } from './consumer-service-location-platform.controller';
import { ConsumerServiceLocationService } from './consumer-service-location.service';
import { ConsumerServiceMemoryController } from './consumer-service-memory.controller';
import { ConsumerServiceMemoryService } from './consumer-service-memory.service';
import { ConsumerServiceRatingsService } from './consumer-service-ratings.service';
import { ConsumerServicesController } from './consumer-services.controller';
import { MEDIA_SAFETY_SCANNER } from './media-safety-scanner.port';
import { OBJECT_STORAGE, ObjectStoragePort } from './object-storage.port';
import { ProviderCommercialPlatformController } from './provider-commercial-platform.controller';
import { ProviderCommercialService } from './provider-commercial.service';
import { ProviderMediaPlatformController } from './provider-media-platform.controller';
import { ProviderMediaService } from './provider-media.service';
import { ProviderOfferingContinuityController } from './provider-offering-continuity.controller';
import { ProviderOfferingContinuityService } from './provider-offering-continuity.service';
import { createObjectStorageAdapterFromEnv } from './s3-compatible-object-storage.adapter';
import { ServiceBookingAccessService } from './service-booking-access.service';
import { ServiceBookingRatingService } from './service-booking-rating.service';
import { ServiceBookingTransitionService } from './service-booking-transition.service';
import { ServicesMarketplaceController } from './services-marketplace.controller';
import { ServicesMarketplaceOperationsSummaryController } from './services-marketplace-operations-summary.controller';
import { ServicesMarketplaceOperationsSummaryService } from './services-marketplace-operations-summary.service';
import { ServicesPlatformController } from './services-platform.controller';
import { ServicesMarketplaceOperationsService } from './services-marketplace-operations.service';
import { ServicesMarketplaceService } from './services-marketplace.service';

@Module({
  imports: [AccessModule, EntitlementsModule],
  controllers: [
    ServicesMarketplaceController,
    ServicesPlatformController,
    ServicesMarketplaceOperationsSummaryController,
    ProviderCommercialPlatformController,
    ProviderMediaPlatformController,
    ConsumerDispatchPlatformController,
    ConsumerProviderAgentPlatformController,
    ConsumerProviderOperatorPlatformController,
    ConsumerServiceLocationPlatformController,
    ConsumerServicesController,
    ConsumerCommercialDiscoveryController,
    ConsumerServiceMemoryController,
    ConsumerBookingsController,
    ConsumerOffersController,
    ConsumerProviderExperienceController,
    ConsumerProviderAgentController,
    ConsumerProviderOperatorController,
    ConsumerProviderMediaController,
    ProviderOfferingContinuityController,
  ],
  providers: [
    PrismaService,
    ServiceBookingAccessService,
    ServiceBookingRatingService,
    ServiceBookingTransitionService,
    ServicesMarketplaceOperationsService,
    ServicesMarketplaceOperationsSummaryService,
    ServicesMarketplaceService,
    ConsumerAvailabilityService,
    ConsumerBookingsService,
    ConsumerCommercialDiscoveryService,
    ConsumerDispatchService,
    ConsumerFulfilmentService,
    ConsumerOffersService,
    ConsumerPaymentsService,
    ConsumerProviderAgentService,
    ConsumerProviderExperienceService,
    ConsumerProviderOperatorService,
    ConsumerServiceCompletionService,
    ConsumerServiceLocationService,
    ConsumerServiceMemoryService,
    ConsumerServiceRatingsService,
    ProviderCommercialService,
    ProviderMediaService,
    ProviderOfferingContinuityService,
    { provide: OBJECT_STORAGE, useFactory: createObjectStorageAdapterFromEnv },
    {
      provide: MEDIA_SAFETY_SCANNER,
      inject: [OBJECT_STORAGE],
      useFactory: (storage: ObjectStoragePort) => createMediaSafetyScannerFromEnv(storage),
    },
  ],
  exports: [ServicesMarketplaceService],
})
export class ServicesMarketplaceModule {}
