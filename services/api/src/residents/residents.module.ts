import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ResidentsController } from './residents.controller';

@Module({ controllers: [ResidentsController], providers: [PrismaService] })
export class ResidentsModule {}
