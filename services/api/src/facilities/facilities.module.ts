import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FacilitiesController } from './facilities.controller';

@Module({controllers:[FacilitiesController],providers:[PrismaService]})
export class FacilitiesModule{}
