import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { AmenitiesController } from './amenities.controller';
import { AmenitiesService } from './amenities.service';

@Module({
  imports: [EntitlementsModule],
  controllers: [AmenitiesController],
  providers: [AmenitiesService, PrismaService],
})
export class AmenitiesModule {}
