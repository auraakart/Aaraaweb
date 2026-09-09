import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AmenitiesController } from './amenities.controller';
import { AmenitiesService } from './amenities.service';

@Module({
  controllers: [AmenitiesController],
  providers: [AmenitiesService, PrismaService],
})
export class AmenitiesModule {}
