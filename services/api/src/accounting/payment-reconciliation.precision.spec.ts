import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PaymentReconciliationService } from './payment-reconciliation.service';

const societyId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const paymentId = '33333333-3333-4333-8333-333333333333';

describe('V4.90.10 provider reconciliation paise precision', () => {
  const prisma = {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  };

  it.each([-1, 0.5, 100.01, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'refuses invalid observation %s before BigInt comparison or SQL', async amount => {
      vi.clearAllMocks();
      const service = new PaymentReconciliationService(prisma as never);
      await expect(service.recordObservation(societyId, paymentId, {
        observedProviderStatus: 'CAPTURED', observedAmountPaise: amount,
      })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    },
  );

  it.each([0, -1, 0.25, 125.01, Number.NaN, Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'refuses invalid refund operation amount %s before SQL', async amount => {
      vi.clearAllMocks();
      const service = new PaymentReconciliationService(prisma as never);
      await expect(service.createOperation(societyId, userId, paymentId, {
        operationType: 'REFUND', provider: 'gateway-adapter',
        amountPaise: amount, idempotencyKey: 'refund-operation',
      })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('refuses malformed optional amount on status-only queries', async () => {
    vi.clearAllMocks();
    const service = new PaymentReconciliationService(prisma as never);
    await expect(service.createOperation(societyId, userId, paymentId, {
      operationType: 'STATUS_QUERY', provider: 'gateway-adapter',
      amountPaise: Number.POSITIVE_INFINITY, idempotencyKey: 'query-operation',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
