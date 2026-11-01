import 'reflect-metadata';
import { Module, INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiCorsOptions } from './cors-policy';

@Module({})
class CorsTestModule {}

describe('API browser preflight contract', () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    app = await NestFactory.create(CorsTestModule, { logger: false });
    app.enableCors(apiCorsOptions(['http://localhost:3001']));
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });
  afterAll(async () => { await app?.close(); });

  it('permits an allowed-origin idempotent POST preflight', async () => {
    const response = await fetch(url, { method: 'OPTIONS', headers: {
      Origin: 'http://localhost:3001', 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type,idempotency-key',
    } });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3001');
    expect(response.headers.get('access-control-allow-headers')?.toLowerCase().split(',')).toContain('idempotency-key');
  });

  it('does not authorize an unlisted origin', async () => {
    const response = await fetch(url, { method: 'OPTIONS', headers: {
      Origin: 'https://untrusted.example', 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'idempotency-key',
    } });
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('retains the explicit header and method boundary', async () => {
    const response = await fetch(url, { method: 'OPTIONS', headers: {
      Origin: 'http://localhost:3001', 'Access-Control-Request-Method': 'TRACE',
      'Access-Control-Request-Headers': 'x-arbitrary-authority',
    } });
    expect(response.headers.get('access-control-allow-methods')).not.toContain('TRACE');
    expect(response.headers.get('access-control-allow-headers')).not.toContain('x-arbitrary-authority');
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
  });
});
