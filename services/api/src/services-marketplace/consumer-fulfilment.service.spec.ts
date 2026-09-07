import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ServiceBookingStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ConsumerFulfilmentService } from './consumer-fulfilment.service';

function setup() {
  const tx = { $queryRaw: vi.fn() };
  const prisma = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const push = { sendConsumerBookingEvent: vi.fn().mockResolvedValue(undefined) };
  return {
    tx,
    prisma,
    push,
    service: new ConsumerFulfilmentService(
      prisma as unknown as ConstructorParameters<typeof ConsumerFulfilmentService>[0],
      push as unknown as ConstructorParameters<typeof ConsumerFulfilmentService>[1],
    ),
  };
}

describe('ConsumerFulfilmentService', () => {
  it('confirms a requested booking and records an append-only event', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: '11111111-1111-1111-1111-111111111111', status: ServiceBookingStatus.REQUESTED }])
      .mockResolvedValueOnce([{ id: '11111111-1111-1111-1111-111111111111', status: ServiceBookingStatus.CONFIRMED }])
      .mockResolvedValueOnce([]);

    const result = await service.transition(
      '22222222-2222-2222-2222-222222222222',
      '11111111-1111-1111-1111-111111111111',
      ServiceBookingStatus.CONFIRMED,
      'Accepted by operations',
    );

    expect(result.status).toBe(ServiceBookingStatus.CONFIRMED);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
  });

  it('rejects an invalid state transition before updating', async () => {
    const { tx, service } = setup();
    tx.$queryRaw.mockResolvedValueOnce([
      { id: '11111111-1111-1111-1111-111111111111', status: ServiceBookingStatus.REQUESTED },
    ]);

    await expect(service.transition(
      '22222222-2222-2222-2222-222222222222',
      '11111111-1111-1111-1111-111111111111',
      ServiceBookingStatus.COMPLETED,
    )).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('protects terminal bookings from further transitions', async () => {
    const { tx, service } = setup();
    tx.$queryRaw.mockResolvedValueOnce([
      { id: '11111111-1111-1111-1111-111111111111', status: ServiceBookingStatus.COMPLETED },
    ]);

    await expect(service.transition(
      '22222222-2222-2222-2222-222222222222',
      '11111111-1111-1111-1111-111111111111',
      ServiceBookingStatus.CANCELLED,
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a stale concurrent transition when the conditional update returns no row', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: '11111111-1111-1111-1111-111111111111', status: ServiceBookingStatus.CONFIRMED }])
      .mockResolvedValueOnce([]);

    await expect(service.transition(
      '22222222-2222-2222-2222-222222222222',
      '11111111-1111-1111-1111-111111111111',
      ServiceBookingStatus.IN_PROGRESS,
    )).rejects.toThrow('changed concurrently');

    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('returns not found for an unknown booking', async () => {
    const { tx, service } = setup();
    tx.$queryRaw.mockResolvedValueOnce([]);

    await expect(service.transition(
      '22222222-2222-2222-2222-222222222222',
      '11111111-1111-1111-1111-111111111111',
      ServiceBookingStatus.CONFIRMED,
    )).rejects.toBeInstanceOf(NotFoundException);
  });
});
