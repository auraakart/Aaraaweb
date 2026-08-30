import { Controller, Get, Module } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { SocietiesModule } from './societies/societies.module';

@Controller('health')
class HealthController {
  @Get()
  health() {
    return { status: 'ok', service: 'aaraagate-api' };
  }
}

@Module({
  imports: [SocietiesModule],
  controllers: [HealthController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
