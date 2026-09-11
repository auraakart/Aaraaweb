import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { createMediaSafetyScannerFromEnv } from './clamav-media-safety-scanner.adapter';
import { ConsumerAvailabilityService } from './consumer-availability.service';
import { ConsumerBookingsController } from './consumer-bookings.controller';
import { ConsumerBookingsService } from './consumer-bookings.service';
import { ConsumerDispatchPlatformController } from './consumer-dispatch-platform.controller';
import { ConsumerDispatchService } from './consumer-dispatch.service';
import { ConsumerFulfilmentService } from './consumer-fulfilment.service';
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
import { ProviderMediaPlatformController } from './provider-media-platform.controller';
import { ProviderMediaService } from './provider-media.service';
import { createObjectStorageAdapterFromEnv } from './s3-compatible-object-storage.adapter';
import { ServiceBookingAccessService } from './service-booking-access.service';
import { ServiceBookingRatingService } from './service-booking-rating.service';
import { ServiceBookingTransitionService } from './service-booking-transition.service';
import { ServicesMarketplaceController } from './services-marketplace.controller';
import { ServicesPlatformController } from './services-platform.controller';
import { ServicesMarketplaceOperationsService } from './services-marketplace-operations.service';
import { ServicesMarketplaceService } from './services-marketplace.service';

@Module({
  imports: [AccessModule, EntitlementsModule],
  controllers: [
    ServicesMarketplaceController,
    ServicesPlatformController,
    ProviderMediaPlatformController,
    ConsumerDispatchPlatformController,
    ConsumerProviderAgentPlatformController,
    ConsumerProviderOperatorPlatformController,
    ConsumerServiceLocationPlatformController,
    ConsumerServicesController,
    ConsumerServiceMemoryController,
    ConsumerBookingsController,
    ConsumerProviderExperienceController,
    ConsumerProviderAgentController,
    ConsumerProviderOperatorController,
    ConsumerProviderMediaController,
  ],
  providers: [
    PrismaService,
    ServiceBookingAccessService,
    ServiceBookingRatingService,
    ServiceBookingTransitionService,
    ServicesMarketplaceOperationsService,
    ServicesMarketplaceService,
    ConsumerAvailabilityService,
    ConsumerBookingsService,
    ConsumerDispatchService,
    ConsumerFulfilmentService,
    ConsumerPaymentsService,
    ConsumerProviderAgentService,
    ConsumerProviderExperienceService,
    ConsumerProviderOperatorService,
    ConsumerServiceCompletionService,
    ConsumerServiceLocationService,
    ConsumerServiceMemoryService,
    ConsumerServiceRatingsService,
    ProviderMediaService,
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
