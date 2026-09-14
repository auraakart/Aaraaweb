import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UtilitiesController } from './utilities.controller';
import { UtilitiesService } from './utilities.service';
import { UtilityChargesController } from './utility-charges.controller';
import { UtilityChargesService } from './utility-charges.service';

@Module({
  imports: [PrismaModule],
  controllers: [UtilitiesController, UtilityChargesController],
  providers: [UtilitiesService, UtilityChargesService],
})
export class UtilitiesModule {}
