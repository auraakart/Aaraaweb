import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AccessModule } from './access/access.module';
import { AccountingModule } from './accounting/accounting.module';
import { AmenitiesModule } from './amenities/amenities.module';
import { PrismaService } from './prisma/prisma.service';
import { AuthModule } from './auth/auth.module';
import { EntitlementsModule } from './entitlements/entitlements.module';
import { FacilitiesModule } from './facilities/facilities.module';
import { GovernanceModule } from './governance/governance.module';
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
import { BillingModule } from './billing/billing.module';
import { ReportsModule } from './reports/reports.module';
import { HealthController } from './health/health.controller';
import { RequestObservabilityMiddleware } from './observability/request-observability.middleware';

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
    AmenitiesModule,
    FacilitiesModule,
    ServicesMarketplaceModule,
    BillingModule,
    AccountingModule,
    GovernanceModule,
    ReportsModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService, RequestObservabilityMiddleware],
  exports: [PrismaService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestObservabilityMiddleware).forRoutes('*');
  }
}
