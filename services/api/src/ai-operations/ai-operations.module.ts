import { Module } from '@nestjs/common';
import { AmenitiesModule } from '../amenities/amenities.module';
import { HelpdeskModule } from '../helpdesk/helpdesk.module';
import { PrismaService } from '../prisma/prisma.service';
import { VisitorsModule } from '../visitors/visitors.module';
import { AiOperationsController } from './ai-operations.controller';
import { AiOperationsService } from './ai-operations.service';

@Module({
  imports:[HelpdeskModule,AmenitiesModule,VisitorsModule],
  controllers:[AiOperationsController],
  providers:[AiOperationsService,PrismaService],
})
export class AiOperationsModule {}
