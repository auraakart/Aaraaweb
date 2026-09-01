import { Module } from '@nestjs/common';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PrismaService } from '../prisma/prisma.service';
import { AccessController } from './access.controller';
import { AccessService } from './access.service';

@Module({
  imports: [EntitlementsModule],
  controllers: [AccessController],
  providers: [PrismaService, AccessService],
  exports: [AccessService],
})
export class AccessModule {}
