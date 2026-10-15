import { describe, expect, it } from 'vitest';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { IntegrationRegistryController } from './integration-registry.controller';

describe('IntegrationRegistryController authorization', () => {
  for (const method of ['list','configurationList','configurationEvents'] as const) {
    it(`${method} requires society configuration read permission`, () => {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, IntegrationRegistryController.prototype[method]))
        .toEqual([AppPermission.SOCIETY_CONFIGURATION_READ]);
    });
  }

  it('updateConfiguration requires society configuration manage permission', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, IntegrationRegistryController.prototype.updateConfiguration))
      .toEqual([AppPermission.SOCIETY_CONFIGURATION_MANAGE]);
  });
});
