import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProcurementCommercialService } from './procurement-commercial.service';

describe('ProcurementCommercialService', () => {
  function setup() {
    const tx = { $queryRaw: vi.fn(), $executeRaw: vi.fn() };
    const prisma = { $queryRaw: vi.fn(), $transaction: vi.fn(async (cb: (value: typeof tx) => Promise<unknown>) => cb(tx)) };
    return { prisma, tx, service: new ProcurementCommercialService(prisma as never) };
  }

  it('rejects a quote from a vendor outside the current active society vendor set', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([{ status: 'SUBMITTED' }]).mockResolvedValueOnce([]);
    await expect(service.addQuote('society-1','actor-1','request-1',{
      vendorId:'11111111-1111-1111-1111-111111111111', amountPaise:1000,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('selects only a received quote for a submitted request and appends evidence', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id:'request-1', status:'SUBMITTED' }])
      .mockResolvedValueOnce([{ id:'quote-1', vendorId:'vendor-1' }]);
    await expect(service.selectQuote('society-1','actor-1','request-1','quote-1')).resolves.toEqual({
      requestId:'request-1', quoteId:'quote-1', vendorId:'vendor-1',
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(3);
  });

  it('requires an approved request with a selected quote before issuing a PO', async () => {
    const { tx, service } = setup();
    tx.$queryRaw.mockResolvedValueOnce([{ id:'request-1', status:'SUBMITTED', selectedQuoteId:'quote-1' }]);
    await expect(service.issuePurchaseOrder('society-1','actor-1','request-1',{poNumber:'PO-1'})).rejects.toBeInstanceOf(BadRequestException);
  });
});
