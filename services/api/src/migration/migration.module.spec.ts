import 'reflect-metadata';
import {MODULE_METADATA} from '@nestjs/common/constants';
import {describe,expect,it} from 'vitest';
import {EntitlementsModule} from '../entitlements/entitlements.module';
import {MigrationModule} from './migration.module';
import {OnboardingController} from './onboarding.controller';
import {OnboardingReadinessService} from './onboarding-readiness.service';

describe('MigrationModule onboarding wiring',()=>{
  it('wires entitlement-aware onboarding readiness into the migration/onboarding domain',()=>{
    const imports=(Reflect.getMetadata(MODULE_METADATA.IMPORTS,MigrationModule)??[]) as unknown[];
    const controllers=(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS,MigrationModule)??[]) as unknown[];
    const providers=(Reflect.getMetadata(MODULE_METADATA.PROVIDERS,MigrationModule)??[]) as unknown[];
    expect(imports).toContain(EntitlementsModule);
    expect(controllers).toContain(OnboardingController);
    expect(providers).toContain(OnboardingReadinessService);
  });
});
