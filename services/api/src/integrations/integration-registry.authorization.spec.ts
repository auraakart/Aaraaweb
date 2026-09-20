import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { IntegrationRegistryController } from './integration-registry.controller';

describe('IntegrationRegistryController authorization', () => {
  it('requires society configuration read permission', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, IntegrationRegistryController.prototype.list))
      .toEqual([AppPermission.SOCIETY_CONFIGURATION_READ]);
  });
});
