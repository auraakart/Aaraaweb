import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { AccountingModule } from './accounting.module';
import { OpeningBalancesController } from './opening-balances.controller';
import { OpeningBalancesService } from './opening-balances.service';

describe('AccountingModule dependency wiring', () => {
  it('imports EntitlementsModule so FeatureGuard can resolve EntitlementService', () => {
    const imports = (Reflect.getMetadata(MODULE_METADATA.IMPORTS, AccountingModule) ?? []) as unknown[];

    expect(imports).toContain(EntitlementsModule);
  });

  it('registers and exports the opening-balance runtime contract', () => {
    const controllers = (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AccountingModule) ?? []) as unknown[];
    const providers = (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AccountingModule) ?? []) as unknown[];
    const exportsList = (Reflect.getMetadata(MODULE_METADATA.EXPORTS, AccountingModule) ?? []) as unknown[];

    expect(controllers).toContain(OpeningBalancesController);
    expect(providers).toContain(OpeningBalancesService);
    expect(exportsList).toContain(OpeningBalancesService);
  });
});
