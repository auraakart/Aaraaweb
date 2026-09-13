import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { VendorsService } from './vendors.service';

describe('VendorsService', () => {
  function setup() {
    const tx = { $queryRaw: vi.fn(), $executeRaw: vi.fn() };
    const prisma = {
      $queryRaw: vi.fn(),
      $transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    return { prisma, tx, service: new VendorsService(prisma as never) };
  }

  it('rejects a preferred vendor outside the current active society vendor set', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValue([]);

    await expect(service.createRequest('society-1', 'actor-1', {
      requestNumber: 'PR-1',
      title: 'Lift maintenance spares',
      estimatedAmountPaise: 150000,
      preferredVendorId: '11111111-1111-1111-1111-111111111111',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates procurement request and append-only creation evidence transactionally', async () => {
    const { tx, service } = setup();
    tx.$queryRaw.mockResolvedValue([{ id: 'request-1', societyId: 'society-1', requestNumber: 'PR-1', status: 'DRAFT', preferredVendorId: null }]);

    const result = await service.createRequest('society-1', 'actor-1', {
      requestNumber: 'PR-1',
      title: 'Pump service',
      estimatedAmountPaise: 50000,
    });
    expect(result.status).toBe('DRAFT');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('requires submitted state before approval', async () => {
    const { prisma, tx, service } = setup();
    prisma.$queryRaw.mockResolvedValue([{ id: 'request-1', societyId: 'society-1', requestNumber: 'PR-1', status: 'DRAFT', preferredVendorId: null }]);
    tx.$queryRaw.mockResolvedValue([]);

    await expect(service.approveRequest('society-1', 'actor-1', 'request-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
