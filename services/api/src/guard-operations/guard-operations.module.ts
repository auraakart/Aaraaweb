import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GuardOperationsController } from './guard-operations.controller';
import { GuardOperationsService } from './guard-operations.service';

@Module({
  controllers:[GuardOperationsController],
  providers:[GuardOperationsService,PrismaService],
  exports:[GuardOperationsService],
})
export class GuardOperationsModule {}
