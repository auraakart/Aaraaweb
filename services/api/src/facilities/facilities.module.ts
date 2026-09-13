import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FacilitiesController } from './facilities.controller';
import { FacilitiesPreventiveController } from './facilities-preventive.controller';
import { FacilitiesContractsController } from './facilities-contracts.controller';
import { FacilitiesAlertsController } from './facilities-alerts.controller';
import { FacilitiesAlertsService } from './facilities-alerts.service';

@Module({controllers:[FacilitiesController,FacilitiesPreventiveController,FacilitiesContractsController,FacilitiesAlertsController],providers:[PrismaService,FacilitiesAlertsService]})
export class FacilitiesModule{}
