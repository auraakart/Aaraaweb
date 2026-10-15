import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GatesModule } from '../gates/gates.module';
import { SocietyWorkforceController } from './society-workforce.controller';
import { SocietyWorkforceService } from './society-workforce.service';

@Module({
  imports: [GatesModule],
  controllers: [SocietyWorkforceController],
  providers: [PrismaService, SocietyWorkforceService],
  exports: [SocietyWorkforceService],
})
export class SocietyWorkforceModule {}
