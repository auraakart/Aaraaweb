import { Controller, Get, Module } from '@nestjs/common';
import { AccessModule } from './access/access.module';
import { PrismaService } from './prisma/prisma.service';
import { AuthModule } from './auth/auth.module';
import { EntitlementsModule } from './entitlements/entitlements.module';
import { HelpdeskModule } from './helpdesk/helpdesk.module';
import { NoticesModule } from './notices/notices.module';
import { SosModule } from './sos/sos.module';
import { HouseholdsModule } from './households/households.module';
import { ResidentsModule } from './residents/residents.module';
import { ServicesMarketplaceModule } from './services-marketplace/services-marketplace.module';
import { SocietiesModule } from './societies/societies.module';
import { PropertiesModule } from './properties/properties.module';
import { GatesModule } from './gates/gates.module';
import { VisitorsModule } from './visitors/visitors.module';
import { NotificationsModule } from './notifications/notifications.module';
import { WorkforceModule } from './workforce/workforce.module';

@Controller('health')
class HealthController {
  @Get()
  health() {
    return { status: 'ok', service: 'aaraagate-api' };
  }
}

@Module({
  imports: [
    AuthModule,
    EntitlementsModule,
    NotificationsModule,
    SocietiesModule,
    ResidentsModule,
    PropertiesModule,
    HouseholdsModule,
    WorkforceModule,
    HelpdeskModule,
    NoticesModule,
    SosModule,
    GatesModule,
    VisitorsModule,
    AccessModule,
    ServicesMarketplaceModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
