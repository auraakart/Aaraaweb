import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementService } from './entitlement.service';
import { FeatureGuard } from './feature.guard';

@Module({
  providers: [PrismaService, EntitlementService, FeatureGuard],
  exports: [EntitlementService, FeatureGuard],
})
export class EntitlementsModule {}
