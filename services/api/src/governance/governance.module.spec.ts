import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { GovernanceModule } from './governance.module';

describe('GovernanceModule dependency wiring', () => {
  it('imports EntitlementsModule so FeatureGuard can resolve EntitlementService', () => {
    const imports = (Reflect.getMetadata(MODULE_METADATA.IMPORTS, GovernanceModule) ?? []) as unknown[];

    expect(imports).toContain(EntitlementsModule);
  });
});
