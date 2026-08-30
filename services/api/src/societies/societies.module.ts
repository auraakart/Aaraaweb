import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SocietiesController } from './societies.controller';

@Module({ controllers: [SocietiesController], providers: [PrismaService] })
export class SocietiesModule {}
