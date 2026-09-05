import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementService } from './entitlement.service';
import { FeatureGuard } from './feature.guard';
import { PlatformEntitlementsController } from './platform-entitlements.controller';

@Module({
  controllers: [PlatformEntitlementsController],
  providers: [PrismaService, EntitlementService, FeatureGuard],
  exports: [EntitlementService, FeatureGuard],
})
export class EntitlementsModule {}
