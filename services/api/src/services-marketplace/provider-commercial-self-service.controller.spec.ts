import { describe, expect, it, vi } from 'vitest';
import { ProviderCommercialSelfServiceController } from './provider-commercial-self-service.controller';

describe('ProviderCommercialSelfServiceController', () => {
  it('resolves the authenticated provider before returning commercial status', async () => {
    const operators = {
      resolveProvider: vi.fn().mockResolvedValue({ providerId: '11111111-1111-4111-8111-111111111111' }),
    };
    const commercial = {
      get: vi.fn().mockResolvedValue({
        providerId: '11111111-1111-4111-8111-111111111111',
        subscriptionTier: 'GROWTH',
        placementType: 'FEATURED',
        subscriptionCurrent: true,
        placementCurrent: true,
      }),
    };
    const controller = new ProviderCommercialSelfServiceController(
      operators as unknown as ConstructorParameters<typeof ProviderCommercialSelfServiceController>[0],
      commercial as unknown as ConstructorParameters<typeof ProviderCommercialSelfServiceController>[1],
    );

    const result = await controller.getMine('22222222-2222-4222-8222-222222222222');

    expect(operators.resolveProvider).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222');
    expect(commercial.get).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    expect(result).toEqual(expect.objectContaining({ subscriptionTier: 'GROWTH', placementType: 'FEATURED' }));
  });

  it('rejects missing authentication before provider resolution', async () => {
    const operators = { resolveProvider: vi.fn() };
    const commercial = { get: vi.fn() };
    const controller = new ProviderCommercialSelfServiceController(
      operators as unknown as ConstructorParameters<typeof ProviderCommercialSelfServiceController>[0],
      commercial as unknown as ConstructorParameters<typeof ProviderCommercialSelfServiceController>[1],
    );

    await expect(controller.getMine('')).rejects.toThrow('Authentication required');
    expect(operators.resolveProvider).not.toHaveBeenCalled();
    expect(commercial.get).not.toHaveBeenCalled();
  });
});
