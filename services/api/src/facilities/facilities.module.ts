import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FacilitiesController } from './facilities.controller';
import { FacilitiesPreventiveController } from './facilities-preventive.controller';

@Module({controllers:[FacilitiesController,FacilitiesPreventiveController],providers:[PrismaService]})
export class FacilitiesModule{}
