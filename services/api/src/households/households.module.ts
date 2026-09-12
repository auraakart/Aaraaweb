import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HouseholdService } from './household.service';
import { HouseholdsController } from './households.controller';
import { ParkingAdminController } from './parking-admin.controller';
import { HouseholdChangeRequestService } from './household-change-request.service';
import { HouseholdChangeRequestsController } from './household-change-requests.controller';
import { OccupancyLifecycleController } from './occupancy-lifecycle.controller';
import { OccupancyLifecycleService } from './occupancy-lifecycle.service';

@Module({
  controllers: [HouseholdsController, ParkingAdminController, HouseholdChangeRequestsController, OccupancyLifecycleController],
  providers: [PrismaService, HouseholdService, HouseholdChangeRequestService, OccupancyLifecycleService],
  exports: [HouseholdService, HouseholdChangeRequestService, OccupancyLifecycleService],
})
export class HouseholdsModule {}
