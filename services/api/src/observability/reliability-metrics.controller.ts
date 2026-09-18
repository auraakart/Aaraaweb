import { Controller, Get } from '@nestjs/common';
import { ReliabilityMetricsService } from './reliability-metrics.service';

@Controller('health/metrics')
export class ReliabilityMetricsController {
  constructor(private readonly metrics: ReliabilityMetricsService) {}

  @Get()
  getMetrics() {
    return {
      service: 'aaraagate-api',
      environment: process.env.NODE_ENV ?? 'development',
      version: process.env.APP_VERSION ?? 'dev',
      commit: process.env.GIT_SHA ?? 'unknown',
      ...this.metrics.snapshot(),
    };
  }
}
