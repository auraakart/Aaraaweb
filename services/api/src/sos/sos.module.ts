import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { SosController } from './sos.controller';
import { SosService } from './sos.service';

@Module({
  imports: [EntitlementsModule],
  controllers: [SosController],
  providers: [PrismaService, SosService],
  exports: [SosService],
})
export class SosModule {}
