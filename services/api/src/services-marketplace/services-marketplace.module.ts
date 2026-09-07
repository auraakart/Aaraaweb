import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerAvailabilityService } from './consumer-availability.service';
import { ConsumerBookingsController } from './consumer-bookings.controller';
import { ConsumerBookingsService } from './consumer-bookings.service';
import { ConsumerFulfilmentService } from './consumer-fulfilment.service';
import { ConsumerPaymentsService } from './consumer-payments.service';
import { ConsumerServicesController } from './consumer-services.controller';
import { ServicesMarketplaceController } from './services-marketplace.controller';
import { ServicesPlatformController } from './services-platform.controller';
import { ServicesMarketplaceOperationsService } from './services-marketplace-operations.service';
import { ServicesMarketplaceService } from './services-marketplace.service';

@Module({
  imports: [AccessModule, EntitlementsModule],
  controllers: [
    ServicesMarketplaceController,
    ServicesPlatformController,
    ConsumerServicesController,
    ConsumerBookingsController,
  ],
  providers: [
    PrismaService,
    ServicesMarketplaceOperationsService,
    ServicesMarketplaceService,
    ConsumerAvailabilityService,
    ConsumerBookingsService,
    ConsumerFulfilmentService,
    ConsumerPaymentsService,
  ],
  exports: [ServicesMarketplaceService],
})
export class ServicesMarketplaceModule {}
