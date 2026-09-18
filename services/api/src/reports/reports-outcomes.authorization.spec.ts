import { describe,expect,it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ReportsAnalyticsController } from './reports-analytics.controller';
import { ReportsPlatformAnalyticsController } from './reports-platform-analytics.controller';

describe('V4.8 outcome analytics authorization',()=>{
  it('requires reports read for society outcome analytics',()=>{
    expect(Reflect.getMetadata(PERMISSIONS_KEY,ReportsAnalyticsController.prototype.outcomes)).toEqual([AppPermission.REPORTS_READ]);
  });

  it('requires platform consumer-booking visibility for independent-home outcomes',()=>{
    expect(Reflect.getMetadata(PERMISSIONS_KEY,ReportsPlatformAnalyticsController.prototype.outcomes)).toEqual([AppPermission.PLATFORM_CONSUMER_BOOKING_READ]);
  });
});
