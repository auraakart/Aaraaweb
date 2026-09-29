import 'reflect-metadata';
import {describe,expect,it} from 'vitest';
import {AppPermission} from '../auth/permission.types';
import {PERMISSIONS_KEY} from '../auth/permissions.decorator';
import {OnboardingController} from './onboarding.controller';

describe('OnboardingController authorization',()=>{
  it('keeps authoritative onboarding readiness behind society configuration management',()=>{
    expect(Reflect.getMetadata(PERMISSIONS_KEY,OnboardingController.prototype.readiness)).toEqual([
      AppPermission.SOCIETY_CONFIGURATION_MANAGE,
    ]);
  });
});
