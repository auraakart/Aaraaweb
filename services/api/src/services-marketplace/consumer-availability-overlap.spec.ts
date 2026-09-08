import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ConsumerAvailabilityService } from './consumer-availability.service';

const offeringId = '11111111-1111-1111-1111-111111111111';
const windowId = '22222222-2222-2222-2222-222222222222';
const input = { dayOfWeek: 1, startMinute: 540, endMinute: 600, slotCapacity: 1, active: true };

function setup() {
  const prisma = {
    serviceOffering: { findUnique: vi.fn().mockResolvedValue({ id: offeringId }) },
    serviceProvider: { findUnique: vi.fn() },
    $queryRaw: vi.fn(),
  };
  return {
    prisma,
    service: new ConsumerAvailabilityService(
      prisma as unknown as ConstructorParameters<typeof ConsumerAvailabilityService>[0],
    ),
  };
}

describe('ConsumerAvailabilityService overlap concurrency hardening', () => {
  it('maps a PostgreSQL exclusion conflict during create to the public overlap error', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce({ code: 'P2010', meta: { code: '23P01' } });

    try {
      await service.createAvailabilityWindow(offeringId, input);
      throw new Error('expected overlap conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as Error).message).toBe('Availability windows for an offering cannot overlap');
    }
  });

  it('maps a PostgreSQL exclusion conflict during update to the same public overlap error', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([{
        id: windowId,
        offeringId,
        dayOfWeek: 1,
        startMinute: 480,
        endMinute: 540,
        slotCapacity: 1,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce({ code: 'P2010', meta: { code: '23P01' } });

    await expect(service.updateAvailabilityWindow(offeringId, windowId, input)).rejects.toThrow(
      'Availability windows for an offering cannot overlap',
    );
  });

  it('does not hide unrelated database errors', async () => {
    const { prisma, service } = setup();
    const unexpected = new Error('database unavailable');
    prisma.$queryRaw.mockResolvedValueOnce([]).mockRejectedValueOnce(unexpected);

    await expect(service.createAvailabilityWindow(offeringId, input)).rejects.toBe(unexpected);
  });
});
