import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FacilitiesController } from './facilities.controller';
import { FacilitiesPreventiveController } from './facilities-preventive.controller';
import { FacilitiesContractsController } from './facilities-contracts.controller';

@Module({controllers:[FacilitiesController,FacilitiesPreventiveController,FacilitiesContractsController],providers:[PrismaService]})
export class FacilitiesModule{}
