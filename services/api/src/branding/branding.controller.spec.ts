import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA, HEADERS_METADATA, MODULE_METADATA } from '@nestjs/common/constants';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { describe, expect, it, vi } from 'vitest';
import { BearerGuard } from '../auth/bearer.guard';
import { AuthModule } from '../auth/auth.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { BrandingController, BrandingContextController, BrandingManageController, BrandingQueryPipe } from './branding.controller';
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


describe('V5.3.2 brand editor HTTP authority', () => {
  it('requires bearer, selected tenant and configuration-management permissions', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, BrandingManageController))
      .toEqual([BearerGuard, TenantGuard, PermissionsGuard]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, BrandingManageController))
      .toEqual([AppPermission.SOCIETY_CONFIGURATION_MANAGE]);
  });

  it('uses only authenticated actor and society on draft and publish routes', () => {
    const createDraft = vi.fn(), publish = vi.fn(), history = vi.fn();
    const controller = new BrandingManageController({ createDraft, publish, history } as unknown as BrandingService);
    const principal = { userId:'actor-a', societyId:'society-a', roles:[] };
    const request = { auth: principal, header:()=>'society-b' };
    const input = { expectedVersion:0, config:{ displayName:'Lake' } };
    controller.create(request, input);
    controller.publish(request, 'revision-a', { expectedPublishedVersion:0 });
    controller.history(request);
    expect(createDraft).toHaveBeenCalledWith('society-a','actor-a',input);
    expect(publish).toHaveBeenCalledWith('society-a','actor-a','revision-a',0);
    expect(history).toHaveBeenCalledWith('society-a','actor-a');
  });

  it.each([
    BrandingManageController.prototype.create,
    BrandingManageController.prototype.history,
    BrandingManageController.prototype.publish,
  ])('disables response caching for editor operations', handler => {
    expect(Reflect.getMetadata(HEADERS_METADATA, handler))
      .toContainEqual({ name: 'Cache-Control', value: 'no-store' });
  });
});
