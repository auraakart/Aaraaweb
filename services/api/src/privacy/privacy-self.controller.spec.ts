import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { BearerGuard } from '../auth/bearer.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { PrivacySelfController } from './privacy-self.controller';

describe('PrivacySelfController authorization boundary', () => {
  it('requires authentication without requiring society tenancy or privileged privacy permissions', () => {
    const guards = (Reflect.getMetadata(GUARDS_METADATA, PrivacySelfController) ?? []) as unknown[];
    expect(guards).toContain(BearerGuard);
    expect(guards).not.toContain(TenantGuard);
    expect(guards).not.toContain(PermissionsGuard);
  });
});
