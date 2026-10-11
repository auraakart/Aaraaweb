import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA, HEADERS_METADATA, MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { BearerGuard } from '../auth/bearer.guard';
import { AuthModule } from '../auth/auth.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { BrandingController, BrandingContextController, BrandingQueryPipe } from './branding.controller';
import { BrandingModule } from './branding.module';
import { BrandingService } from './branding.service';

describe('Branding HTTP boundary', () => {
  it('requires BearerGuard for private context without making public bootstrap private', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, BrandingContextController)).toEqual([BearerGuard]);
    expect(Reflect.getMetadata(GUARDS_METADATA, BrandingController)).toBeUndefined();
  });

  it.each([BrandingController.prototype.bootstrap, BrandingContextController.prototype.config])(
    'prevents public/shared caching of configuration responses', (handler) => {
      expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toContainEqual({ name: 'Cache-Control', value: 'no-store' });
    },
  );

  it('wires existing authentication and entitlement dependencies', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, BrandingModule);
    expect(imports).toContain(AuthModule);
    expect(imports).toContain(EntitlementsModule);
  });

  it('passes only authenticated context to the resolver, ignoring spoofed headers', () => {
    const context = vi.fn();
    const service = { context } as unknown as BrandingService;
    const auth = { userId: 'user-a', societyId: 'society-a', roles: [] };
    const request = { auth, header: () => 'society-b' };
    new BrandingContextController(service).config(request, undefined);
    expect(context).toHaveBeenCalledExactlyOnceWith(auth);
  });

  it('accepts an empty query', () => {
    expect(new BrandingQueryPipe().transform({})).toBeUndefined();
  });

  it.each([{ societyId: 'other' }, { partnerId: 'other' }, { brandId: 'other' }, { featureOverrides: '{}' }])(
    'rejects unsupported query selectors %j', (query) => {
      expect(() => new BrandingQueryPipe().transform(query)).toThrow(BadRequestException);
    },
  );
});
