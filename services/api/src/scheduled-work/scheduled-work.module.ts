import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ScheduledWorkService } from './scheduled-work.service';

@Module({
  imports: [PrismaModule],
  providers: [ScheduledWorkService],
  exports: [ScheduledWorkService],
})
export class ScheduledWorkModule {}
