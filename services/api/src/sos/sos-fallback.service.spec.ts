import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProductFeature } from '../entitlements/entitlement.types';
import { SosFallbackService } from './sos-fallback.service';

describe('SosFallbackService', () => {
  function setup() {
    const prisma = { $queryRaw: vi.fn() };
    const entitlements = { isEnabled: vi.fn() };
    const sos = { trigger: vi.fn() };
    const service = new SosFallbackService(prisma as never, entitlements as never, sos as never);
    return { prisma, entitlements, sos, service };
  }

  it('derives society from current active occupancy and delegates to normal SOS trigger', async () => {
    const { prisma, entitlements, sos, service } = setup();
    prisma.$queryRaw.mockResolvedValue([{ societyId: 'society-1' }]);
    entitlements.isEnabled.mockResolvedValue(true);
    sos.trigger.mockResolvedValue({ id: 'incident-1' });

    const input = { unitId: '11111111-1111-1111-1111-111111111111', category: 'MEDICAL' as const, severity: 'CRITICAL' as const };
    await expect(service.trigger('user-1', input)).resolves.toEqual({ id: 'incident-1' });
    expect(entitlements.isEnabled).toHaveBeenCalledWith('society-1', ProductFeature.SOS);
    expect(sos.trigger).toHaveBeenCalledWith('society-1', 'user-1', input);
  });

  it('rejects units not actively occupied by the authenticated user', async () => {
    const { prisma, entitlements, sos, service } = setup();
    prisma.$queryRaw.mockResolvedValue([]);

    await expect(service.trigger('user-1', { unitId: '11111111-1111-1111-1111-111111111111' })).rejects.toBeInstanceOf(BadRequestException);
    expect(entitlements.isEnabled).not.toHaveBeenCalled();
    expect(sos.trigger).not.toHaveBeenCalled();
  });

  it('rejects a derived society when SOS entitlement is disabled', async () => {
    const { prisma, entitlements, sos, service } = setup();
    prisma.$queryRaw.mockResolvedValue([{ societyId: 'society-1' }]);
    entitlements.isEnabled.mockResolvedValue(false);

    await expect(service.trigger('user-1', { unitId: '11111111-1111-1111-1111-111111111111' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(sos.trigger).not.toHaveBeenCalled();
  });
});
