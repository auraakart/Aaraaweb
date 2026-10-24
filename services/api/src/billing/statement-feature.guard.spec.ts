import { describe, expect, it, vi } from 'vitest';
import { StatementFeatureGuard } from './statement-feature.guard';
import { ProductFeature } from '../entitlements/entitlement.types';

describe('Combined maintenance statement feature gate', () => {
  const context = (societyId?: string) => ({switchToHttp:()=>({getRequest:()=>({auth:{societyId}})})});
  it.each([ProductFeature.MAINTENANCE_BILLING, ProductFeature.PAYMENTS])('denies when %s is disabled', async disabled => {
    const entitlements={isEnabled:vi.fn(async (_society:string,feature:ProductFeature)=>feature!==disabled)};
    await expect(new StatementFeatureGuard(entitlements as never).canActivate(context('society') as never)).rejects.toThrow('features are required');
    expect(entitlements.isEnabled.mock.calls.every(([society])=>society==='society')).toBe(true);
  });
  it('requires society context and both enabled features', async () => {
    const entitlements={isEnabled:vi.fn().mockResolvedValue(true)};
    const guard=new StatementFeatureGuard(entitlements as never);
    await expect(guard.canActivate(context() as never)).rejects.toThrow('Society context');
    expect(entitlements.isEnabled).not.toHaveBeenCalled();
    await expect(guard.canActivate(context('society') as never)).resolves.toBe(true);
    expect(entitlements.isEnabled).toHaveBeenCalledTimes(2);
  });
});
