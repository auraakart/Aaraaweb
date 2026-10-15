import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ResidentsController } from './residents.controller';
import { SocietyRolesController } from './society-roles.controller';

@Module({ controllers: [ResidentsController, SocietyRolesController], providers: [PrismaService], exports: [PrismaService] })
export class ResidentsModule {}
