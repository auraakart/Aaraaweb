import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HouseholdService } from './household.service';
import { HouseholdsController } from './households.controller';
import { ParkingAdminController } from './parking-admin.controller';
import { HouseholdChangeRequestService } from './household-change-request.service';
import { HouseholdChangeRequestsController } from './household-change-requests.controller';

@Module({
  controllers: [HouseholdsController, ParkingAdminController, HouseholdChangeRequestsController],
  providers: [PrismaService, HouseholdService, HouseholdChangeRequestService],
  exports: [HouseholdService, HouseholdChangeRequestService],
})
export class HouseholdsModule {}
