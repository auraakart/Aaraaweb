import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { FacilitiesInventoryService } from './facilities-inventory.service';

function setup() {
  const tx = {
    $queryRaw: vi.fn(),
  };
  const prisma = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn().mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx)),
  };
  return {
    tx,
    prisma,
    service: new FacilitiesInventoryService(prisma as unknown as ConstructorParameters<typeof FacilitiesInventoryService>[0]),
  };
}

describe('FacilitiesInventoryService', () => {
  it('rejects an outbound movement that would make stock negative', async () => {
    const { tx, service } = setup();
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'item-1', onHandQuantity: '2.000' }]);

    await expect(service.recordMovement('society-1', 'user-1', 'item-1', {
      movementType: 'ISSUE',
      quantity: 3,
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects a work-order link outside the active society', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: 'item-1', onHandQuantity: '10.000' }])
      .mockResolvedValueOnce([]);

    await expect(service.recordMovement('society-1', 'user-1', 'item-1', {
      movementType: 'ISSUE',
      quantity: 1,
      workOrderId: 'work-order-other-society',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records a receipt with the authoritative post-update balance', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: 'item-1', onHandQuantity: '2.000' }])
      .mockResolvedValueOnce([{ onHandQuantity: '7.000' }])
      .mockResolvedValueOnce([{ id: 'movement-1', balanceAfter: '7.000' }]);

    const movement = await service.recordMovement('society-1', 'user-1', 'item-1', {
      movementType: 'RECEIPT',
      quantity: 5,
      reference: 'GRN-1001',
    });

    expect(movement).toEqual(expect.objectContaining({ id: 'movement-1', balanceAfter: '7.000' }));
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
  });
});
