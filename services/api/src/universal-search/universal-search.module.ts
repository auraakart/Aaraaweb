import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UniversalSearchController } from './universal-search.controller';
import { UniversalSearchService } from './universal-search.service';

@Module({
  controllers: [UniversalSearchController],
  providers: [PrismaService, UniversalSearchService],
})
export class UniversalSearchModule {}
