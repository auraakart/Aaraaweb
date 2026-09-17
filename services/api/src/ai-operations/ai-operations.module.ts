import { Module } from '@nestjs/common';
import { HelpdeskModule } from '../helpdesk/helpdesk.module';
import { PrismaService } from '../prisma/prisma.service';
import { AiOperationsController } from './ai-operations.controller';
import { AiOperationsService } from './ai-operations.service';

@Module({
  imports:[HelpdeskModule],
  controllers:[AiOperationsController],
  providers:[AiOperationsService,PrismaService],
})
export class AiOperationsModule {}
