import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { AuthStateStore } from '../auth/auth-state.store';
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
  constructor(private readonly prisma: PrismaService, private readonly authState: AuthStateStore) {}

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
    const [database, authState] = await Promise.allSettled([
      this.prisma.$queryRawUnsafe('SELECT 1'),
      this.authState.ping(),
    ]);
    const databaseReady = database.status === 'fulfilled';
    const authStateReady = authState.status === 'fulfilled';
    const dependencies = {
      database: databaseReady ? 'ok' : 'unavailable',
      authState: authStateReady ? (authState.value === 'redis' ? 'redis-ok' : 'memory-ok') : 'unavailable',
    };
    if (!databaseReady || !authStateReady) {
      throw new ServiceUnavailableException({
        status: 'not-ready',
        ...releaseMetadata(),
        dependencies,
      });
    }
    return {
      status: 'ready',
      ...releaseMetadata(),
      dependencies,
    };
  }
}
