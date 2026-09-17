import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FacilitiesController } from './facilities.controller';
import { FacilitiesAssetsController } from './facilities-assets.controller';
import { FacilitiesPreventiveController } from './facilities-preventive.controller';
import { FacilitiesContractsController } from './facilities-contracts.controller';
import { FacilitiesAlertsController } from './facilities-alerts.controller';
import { FacilitiesInventoryController } from './facilities-inventory.controller';
import { FacilitiesAlertsService } from './facilities-alerts.service';
import { FacilitiesPreventiveService } from './facilities-preventive.service';
import { FacilitiesInventoryService } from './facilities-inventory.service';

@Module({
  controllers:[
    FacilitiesController,
    FacilitiesAssetsController,
    FacilitiesPreventiveController,
    FacilitiesContractsController,
    FacilitiesAlertsController,
    FacilitiesInventoryController,
  ],
  providers:[
    PrismaService,
    FacilitiesAlertsService,
    FacilitiesPreventiveService,
    FacilitiesInventoryService,
  ],
})
export class FacilitiesModule{}
