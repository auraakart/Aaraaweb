import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function releaseMetadata() {
  return {
    service: 'aaraagate-api',
    environment: process.env.NODE_ENV ?? 'development',
    version: process.env.APP_VERSION ?? 'dev',
    commit: process.env.GIT_SHA ?? 'unknown',
    uptimeSeconds: Math.floor(process.uptime()),
  };
}

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  health() {
    return {
      status: 'ok',
      ...releaseMetadata(),
    };
  }

  @Get('live')
  live() {
    return {
      status: 'ok',
      ...releaseMetadata(),
    };
  }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return {
        status: 'ready',
        ...releaseMetadata(),
        dependencies: {
          database: 'ok',
        },
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'not-ready',
        ...releaseMetadata(),
        dependencies: {
          database: 'unavailable',
        },
      });
    }
  }
}
