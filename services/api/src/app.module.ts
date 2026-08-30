import { Controller, Get, Module } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { ResidentsModule } from './residents/residents.module';
import { SocietiesModule } from './societies/societies.module';

@Controller('health')
class HealthController {
  @Get()
  health() {
    return { status: 'ok', service: 'aaraagate-api' };
  }
}

@Module({
  imports: [SocietiesModule, ResidentsModule],
  controllers: [HealthController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
