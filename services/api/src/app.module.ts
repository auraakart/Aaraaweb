import { Controller, Get, Module } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { AuthModule } from './auth/auth.module';
import { ResidentsModule } from './residents/residents.module';
import { SocietiesModule } from './societies/societies.module';
import { PropertiesModule } from './properties/properties.module';
import { GatesModule } from './gates/gates.module';
import { VisitorsModule } from './visitors/visitors.module';

@Controller('health')
class HealthController {
  @Get()
  health() {
    return { status: 'ok', service: 'aaraagate-api' };
  }
}

@Module({
  imports: [AuthModule, SocietiesModule, ResidentsModule, PropertiesModule, GatesModule, VisitorsModule],
  controllers: [HealthController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
