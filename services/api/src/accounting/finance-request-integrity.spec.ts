import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PaymentOrderService } from '../billing/payment-order.service';
import { SettlementService } from './settlement.service';
import { PaymentExceptionsService } from './payment-exceptions.service';

// Service entrypoints can be called beyond HTTP DTO validation. Reject
// malformed monetary inputs before any accounting write or SQL transaction.
describe('V4.90.9 financial request integrity boundaries', () => {
  const societyId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';
  const referenceId = '33333333-3333-4333-8333-333333333333';
  const prisma = {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  };

  it.each([0, -1, 0.5, 1.01, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid allocation amount %s before writing', async (amountPaise) => {
      vi.clearAllMocks();
      const service = new SettlementService(prisma as never);
      await expect(service.allocate(societyId, userId, referenceId, {
        paymentId: referenceId, amountPaise, idempotencyKey: 'allocation-key',
      })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    },
  );

  it.each([0, -2, 1.5, Number.NaN, Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid reversal and refund amount %s before writing', async (amountPaise) => {
      vi.clearAllMocks();
      const service = new PaymentExceptionsService(prisma as never);
      await expect(service.reverseAllocation(societyId, userId, referenceId, {
        amountPaise, reason: 'Correction', idempotencyKey: 'reverse-key',
      })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.recordRefund(societyId, userId, referenceId, {
        amountPaise, reason: 'Correction', idempotencyKey: 'refund-key',
      })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    },
  );

  it.each(['', ' ', '   \n '])(
    'rejects blank payment retry keys without looking up private invoices', async (idempotencyKey) => {
      vi.clearAllMocks();
      const service = new PaymentOrderService(prisma as never);
      await expect(service.createPayment(societyId, userId, referenceId, idempotencyKey))
        .rejects.toThrow('Idempotency key is required');
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it.each(['', ' \t '])(
    'rejects blank amenity-deposit retry keys without writing', async (idempotencyKey) => {
      vi.clearAllMocks();
      const service = new PaymentOrderService(prisma as never);
      await expect(service.createAmenityDepositPayment(societyId, userId, referenceId, idempotencyKey))
        .rejects.toThrow('Idempotency key is required');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
});
