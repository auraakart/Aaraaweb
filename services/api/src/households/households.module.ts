import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HouseholdService } from './household.service';
import { HouseholdsController } from './households.controller';

@Module({
  controllers: [HouseholdsController],
  providers: [PrismaService, HouseholdService],
  exports: [HouseholdService],
})
export class HouseholdsModule {}
