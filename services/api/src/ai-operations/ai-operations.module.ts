import { Module } from '@nestjs/common';
import { AmenitiesModule } from '../amenities/amenities.module';
import { HelpdeskModule } from '../helpdesk/helpdesk.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { VisitorsModule } from '../visitors/visitors.module';
import { AiOperationsController } from './ai-operations.controller';
import { AiAssistantService } from './ai-assistant.service';
import { AiOperationsService } from './ai-operations.service';

@Module({
  imports:[HelpdeskModule,AmenitiesModule,VisitorsModule,EntitlementsModule],
  controllers:[AiOperationsController],
  providers:[AiOperationsService,AiAssistantService,PrismaService],
})
export class AiOperationsModule {}
