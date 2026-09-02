import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HelpdeskController } from './helpdesk.controller';
import { HelpdeskService } from './helpdesk.service';

@Module({
  controllers: [HelpdeskController],
  providers: [HelpdeskService, PrismaService],
})
export class HelpdeskModule {}
