import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
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
import { ConsumerProviderOperatorController } from './consumer-provider-operator.controller';
import { ConsumerProviderOperatorPlatformController } from './consumer-provider-operator-platform.controller';
import { ConsumerProviderOperatorService } from './consumer-provider-operator.service';
import { ConsumerServiceCompletionService } from './consumer-service-completion.service';
import { ConsumerServiceLocationPlatformController } from './consumer-service-location-platform.controller';
import { ConsumerServiceLocationService } from './consumer-service-location.service';
import { ConsumerServiceRatingsService } from './consumer-service-ratings.service';
import { ConsumerServicesController } from './consumer-services.controller';
import { ServiceBookingAccessService } from './service-booking-access.service';
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
    ConsumerDispatchPlatformController,
    ConsumerProviderAgentPlatformController,
    ConsumerProviderOperatorPlatformController,
    ConsumerServiceLocationPlatformController,
    ConsumerServicesController,
    ConsumerBookingsController,
    ConsumerProviderAgentController,
    ConsumerProviderOperatorController,
  ],
  providers: [
    PrismaService,
    ServiceBookingAccessService,
    ServiceBookingTransitionService,
    ServicesMarketplaceOperationsService,
    ServicesMarketplaceService,
    ConsumerAvailabilityService,
    ConsumerBookingsService,
    ConsumerDispatchService,
    ConsumerFulfilmentService,
    ConsumerPaymentsService,
    ConsumerProviderAgentService,
    ConsumerProviderOperatorService,
    ConsumerServiceCompletionService,
    ConsumerServiceLocationService,
    ConsumerServiceRatingsService,
  ],
  exports: [ServicesMarketplaceService],
})
export class ServicesMarketplaceModule {}
