import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { validationPipeOptions } from './validation-pipe.options';
import { applyHttpSecurityHeaders } from './reliability/http-security';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const httpInstance = app.getHttpAdapter().getInstance() as { disable?: (name: string) => void };
  httpInstance.disable?.('x-powered-by');
  app.use((_request: unknown, response: { setHeader(name: string, value: string): unknown }, next: () => void) => {
    applyHttpSecurityHeaders(response);
    next();
  });
  app.enableShutdownHooks();
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:3001').split(',').map((value) => value.trim()).filter(Boolean);
  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After'],
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000);
}

void bootstrap();
