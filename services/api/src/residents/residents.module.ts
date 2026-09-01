import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ResidentsController } from './residents.controller';

@Module({ controllers: [ResidentsController], providers: [PrismaService], exports: [PrismaService] })
export class ResidentsModule {}
