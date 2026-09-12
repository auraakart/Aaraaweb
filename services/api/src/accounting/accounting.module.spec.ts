import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { AccountingModule } from './accounting.module';

describe('AccountingModule dependency wiring', () => {
  it('imports EntitlementsModule so FeatureGuard can resolve EntitlementService', () => {
    const imports = (Reflect.getMetadata(MODULE_METADATA.IMPORTS, AccountingModule) ?? []) as unknown[];

    expect(imports).toContain(EntitlementsModule);
  });
});
