import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HouseholdChangeRequestService } from './household-change-request.service';
import { HouseholdPreferencesService } from './household-preferences.service';
import { HouseholdService } from './household.service';
import { HouseholdsController } from './households.controller';
import { ParkingAdminController } from './parking-admin.controller';

@Module({
  controllers: [HouseholdsController, ParkingAdminController],
  providers: [PrismaService, HouseholdService, HouseholdChangeRequestService, HouseholdPreferencesService],
  exports: [HouseholdService, HouseholdChangeRequestService, HouseholdPreferencesService],
})
export class HouseholdsModule {}
