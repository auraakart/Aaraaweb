// Run after `pnpm --filter @aaraagate/api build`. Uses real Nest routing,
// BearerGuard and branding resolver with deterministic persistence/session fakes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('reflect-metadata');
const { Module, UnauthorizedException, ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { BrandingController, BrandingContextController } = require('../dist/branding/branding.controller.js');
const { BrandingService } = require('../dist/branding/branding.service.js');
const { BearerGuard } = require('../dist/auth/bearer.guard.js');
const { SessionService } = require('../dist/auth/session.service.js');
const { PrismaService } = require('../dist/prisma/prisma.service.js');
const { EntitlementService } = require('../dist/entitlements/entitlement.service.js');
const { validationPipeOptions } = require('../dist/validation-pipe.options.js');
const societyId = '11111111-1111-4111-8111-111111111111';
let metadataReads = 0;
const prisma = {
  societyMembership: { findFirst: async ({ where }) => where.societyId === societyId && where.userId === 'member' ? { id: 'membership' } : null },
  society: { findFirst: async ({ where }) => {
    metadataReads++;
    assert.equal(where.id, societyId);
    assert.equal(where.status, 'ACTIVE');
    return { id: societyId, name: 'Society A' };
  } },
};
const entitlements = { current: async (id) => {
  assert.equal(id, societyId);
  return { productTier: 'STARTER', enabledFeatures: ['VISITOR_MANAGEMENT', 'AI_ASSISTANT'] };
} };
const sessions = { getPrincipal: async (token) => {
  if (token === 'member') return { userId: 'member', societyId, roles: ['TENANT'] };
  if (token === 'independent') return { userId: 'member', roles: [] };
  if (token === 'revoked') return { userId: 'revoked', societyId, roles: [] };
  if (token === 'cross') return { userId: 'member', societyId: '22222222-2222-4222-8222-222222222222', roles: ['SUPER_ADMIN'] };
  throw new UnauthorizedException('Session is invalid or expired');
} };
class SmokeModule {}
Module({
  controllers: [BrandingController, BrandingContextController],
  providers: [BrandingService, BearerGuard,
    { provide: PrismaService, useValue: prisma },
    { provide: EntitlementService, useValue: entitlements },
    { provide: SessionService, useValue: sessions }],
})(SmokeModule);
const app = await NestFactory.create(SmokeModule, { logger: false });
app.setGlobalPrefix('api/v1');
app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
try {
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  async function request(path, token, extraHeaders = {}) {
    const response = await fetch(`${base}/api/v1${path}`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders },
    });
    return { response, body: await response.json() };
  }
  const publicConfig = await request('/branding/bootstrap');
  assert.equal(publicConfig.response.status, 200);
  assert.equal(publicConfig.response.headers.get('cache-control'), 'no-store');
  assert.equal(publicConfig.body.brand.id, 'aaraagate');
  assert.equal(publicConfig.body.brand.colors.primary, '#0EABBE');
  assert.equal(metadataReads, 0);
  assert.equal((await request('/context/config')).response.status, 401);
  assert.equal((await request('/context/config', 'invalid')).response.status, 401);
  const independent = await request('/context/config', 'independent');
  assert.equal(independent.response.status, 200);
  assert.equal(independent.body.society, null);
  assert.equal(independent.body.entitlements, null);
  assert.equal(metadataReads, 0);
  const current = await request('/context/config', 'member', { 'X-Society-Id': 'other', 'X-Partner-Id': 'other', 'X-Brand-Id': 'other' });
  assert.equal(current.response.status, 200);
  assert.equal(current.response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(current.body.society, { id: societyId, name: 'Society A' });
  assert.deepEqual(current.body.entitlements.enabledFeatures, ['VISITOR_MANAGEMENT', 'AI_ASSISTANT']);
  const before = metadataReads;
  for (const token of ['revoked', 'cross']) {
    assert.equal((await request('/context/config', token)).response.status, 403);
  }
  assert.equal(metadataReads, before);
  for (const selector of ['societyId', 'partnerId', 'brandId']) {
    assert.equal((await request(`/context/config?${selector}=other`, 'member')).response.status, 400);
    assert.equal((await request(`/branding/bootstrap?${selector}=other`)).response.status, 400);
  }
  console.log('V5 branding HTTP smoke passed: auth, membership, spoofing, queries, independent homes, legacy features and cache headers.');
} finally {
  await app.close();
}
