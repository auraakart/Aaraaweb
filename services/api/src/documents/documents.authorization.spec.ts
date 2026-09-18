import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { DocumentsController } from './documents.controller';

describe('DocumentsController authorization', () => {
  it('requires bearer, tenant and permission guards at controller scope', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, DocumentsController)).toEqual([
      BearerGuard,
      TenantGuard,
      PermissionsGuard,
    ]);
  });

  it('keeps published member access separate from privileged document management', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, DocumentsController.prototype.published)).toEqual([
      AppPermission.NOTICE_READ,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, DocumentsController.prototype.publishedDownload)).toEqual([
      AppPermission.NOTICE_READ,
    ]);

    for (const handler of ['management', 'managementDownload', 'history'] as const) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, DocumentsController.prototype[handler])).toEqual([
        AppPermission.DOCUMENTS_READ,
      ]);
    }

    for (const handler of ['uploadIntent', 'create', 'publish', 'archive'] as const) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, DocumentsController.prototype[handler])).toEqual([
        AppPermission.DOCUMENTS_MANAGE,
      ]);
    }
  });
});
