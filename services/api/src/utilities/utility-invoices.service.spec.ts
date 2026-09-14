import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { UtilityInvoicesService } from './utility-invoices.service';

const societyId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const draftId = '33333333-3333-4333-8333-333333333333';

describe('UtilityInvoicesService', () => {
  it('rejects malformed billing periods before opening a transaction', async () => {
    const prisma = { $transaction: vi.fn() };
    const service = new UtilityInvoicesService(prisma as unknown as PrismaService);
    await expect(service.issueFromDraft(societyId, actorId, draftId, {
      billingPeriod: '2026-13',
      dueDate: '2026-10-15',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects zero-value drafts before invoice creation', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{
        id: draftId,
        unitId: '44444444-4444-4444-8444-444444444444',
        meterId: '55555555-5555-4555-8555-555555555555',
        totalPaise: 0,
        status: 'DRAFT',
        periodStart: new Date('2026-09-01T00:00:00Z'),
        periodEnd: new Date('2026-10-01T00:00:00Z'),
        meterCode: 'WATER-1',
        meterType: 'WATER',
      }]),
      $executeRaw: vi.fn(),
    };
    const prisma = { $transaction: vi.fn((cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new UtilityInvoicesService(prisma as unknown as PrismaService);
    await expect(service.issueFromDraft(societyId, actorId, draftId, {
      billingPeriod: '2026-09',
      dueDate: '2026-10-15',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns the already-linked invoice idempotently', async () => {
    const existing = {
      id: '66666666-6666-4666-8666-666666666666',
      invoiceNumber: 'UTIL-202609-33333333',
      amountPaise: 12345,
      unitId: '44444444-4444-4444-8444-444444444444',
      dueDate: new Date('2026-10-15T00:00:00Z'),
    };
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{
          id: draftId,
          unitId: existing.unitId,
          meterId: '55555555-5555-4555-8555-555555555555',
          totalPaise: 12345,
          status: 'ISSUED',
          periodStart: new Date('2026-09-01T00:00:00Z'),
          periodEnd: new Date('2026-10-01T00:00:00Z'),
          meterCode: 'WATER-1',
          meterType: 'WATER',
        }])
        .mockResolvedValueOnce([existing]),
      $executeRaw: vi.fn(),
    };
    const prisma = { $transaction: vi.fn((cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new UtilityInvoicesService(prisma as unknown as PrismaService);
    await expect(service.issueFromDraft(societyId, actorId, draftId, {
      billingPeriod: '2026-09',
      dueDate: '2026-10-15',
    })).resolves.toMatchObject({ id: existing.id, alreadyIssued: true });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
