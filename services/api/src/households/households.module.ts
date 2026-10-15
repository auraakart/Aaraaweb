import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HouseholdService } from './household.service';
import { HouseholdsController } from './households.controller';
import { ParkingAdminController } from './parking-admin.controller';
import { HouseholdChangeRequestService } from './household-change-request.service';
import { HouseholdChangeRequestsController } from './household-change-requests.controller';
import { OccupancyLifecycleController } from './occupancy-lifecycle.controller';
import { OccupancyLifecycleRunner } from './occupancy-lifecycle.runner';
import { OccupancyLifecycleService } from './occupancy-lifecycle.service';
import { OccupancyLifecycleSelfController } from './occupancy-lifecycle-self.controller';
import { OccupancyLifecycleSelfService } from './occupancy-lifecycle-self.service';

@Module({
  controllers: [HouseholdsController, ParkingAdminController, HouseholdChangeRequestsController, OccupancyLifecycleController, OccupancyLifecycleSelfController],
  providers: [PrismaService, HouseholdService, HouseholdChangeRequestService, OccupancyLifecycleService, OccupancyLifecycleSelfService, OccupancyLifecycleRunner],
  exports: [HouseholdService, HouseholdChangeRequestService, OccupancyLifecycleService],
})
export class HouseholdsModule {}
