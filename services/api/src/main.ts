import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:3001').split(',').map((value) => value.trim()).filter(Boolean);
  app.enableCors({ origin: allowedOrigins, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['Authorization', 'Content-Type'] });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000);
}

void bootstrap();
