import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HouseholdService } from './household.service';
import { HouseholdsController } from './households.controller';
import { ParkingAdminController } from './parking-admin.controller';

@Module({
  controllers: [HouseholdsController, ParkingAdminController],
  providers: [PrismaService, HouseholdService],
  exports: [HouseholdService],
})
export class HouseholdsModule {}
