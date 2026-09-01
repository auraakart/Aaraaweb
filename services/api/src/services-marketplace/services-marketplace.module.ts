import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { ServicesMarketplaceController } from './services-marketplace.controller';
import { ServicesMarketplaceService } from './services-marketplace.service';

@Module({
  imports: [AccessModule, EntitlementsModule],
  controllers: [ServicesMarketplaceController],
  providers: [PrismaService, ServicesMarketplaceService],
  exports: [ServicesMarketplaceService],
})
export class ServicesMarketplaceModule {}
