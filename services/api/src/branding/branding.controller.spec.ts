import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA, HEADERS_METADATA, MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { BearerGuard } from '../auth/bearer.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { AuthModule } from '../auth/auth.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { BrandingController, BrandingContextController, BrandingQueryPipe, SocietyBrandEditorController } from './branding.controller';
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


describe('V5.3.2 society editor permission boundary', () => {
  it('requires bearer, tenant, permission and society configuration manage', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, SocietyBrandEditorController))
      .toEqual([BearerGuard, TenantGuard, PermissionsGuard]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, SocietyBrandEditorController))
      .toEqual([AppPermission.SOCIETY_CONFIGURATION_MANAGE]);
  });

  it('routes draft, publish, restore and history only with server-authenticated principal', () => {
    const service = {
      createDraft: vi.fn(), publishDraft: vi.fn(), restorePublished: vi.fn(),listRevisions:vi.fn(),
    };
    const controller = new SocietyBrandEditorController(service as unknown as BrandingService);
    const auth = {userId:'admin-a',societyId:'society-a',roles:[]};
    const request={auth,header:()=> 'other-society'};
    const body={config:{displayName:'Palm'},expectedLatestVersion:null,expectedPublishedVersion:null};
    controller.createDraft(request,body);
    controller.publish(request,{revisionId:'version-a',expectedPublishedVersion:null});
    controller.restore(request,{sourceVersion:1,expectedLatestVersion:2,expectedPublishedVersion:2});
    controller.history(request,undefined);
    expect(service.createDraft).toHaveBeenCalledWith(auth,body);
    expect(service.publishDraft).toHaveBeenCalledWith(auth,{revisionId:'version-a',expectedPublishedVersion:null});
    expect(service.restorePublished).toHaveBeenCalledWith(auth,
      {sourceVersion:1,expectedLatestVersion:2,expectedPublishedVersion:2});
    expect(service.listRevisions).toHaveBeenCalledWith(auth);
  });

  it('prevents caching privileged revisions and publication results', () => {
    for(const fn of [SocietyBrandEditorController.prototype.history,
      SocietyBrandEditorController.prototype.createDraft,
      SocietyBrandEditorController.prototype.publish,
      SocietyBrandEditorController.prototype.restore]) {
      expect(Reflect.getMetadata(HEADERS_METADATA,fn))
        .toContainEqual({name:'Cache-Control',value:'no-store'});
    }
  });
});
