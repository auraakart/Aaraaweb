import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrivacyService } from './privacy.service';

function sqlText(call: unknown) {
  return ((call as { strings?: readonly string[] }).strings ?? []).join(' ');
}

function sqlValues(call: unknown) {
  return (call as { values?: unknown[] }).values ?? [];
}

describe('PrivacyService self-service', () => {
  it('lists only the authenticated subject in the current society context', async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const service = new PrivacyService({ $queryRaw: queryRaw } as never);

    await service.listMine(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    );

    const query = queryRaw.mock.calls[0][0];
    expect(sqlText(query)).toContain('"subjectUserId"=');
    expect(sqlText(query)).toContain('"societyId" IS NOT DISTINCT FROM');
    expect(sqlValues(query)).toContain('11111111-1111-4111-8111-111111111111');
    expect(sqlValues(query)).toContain('22222222-2222-4222-8222-222222222222');
  });

  it('supports an independent-home subject without inventing a society context', async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const service = new PrivacyService({ $queryRaw: queryRaw } as never);

    await service.listMine('11111111-1111-4111-8111-111111111111');

    const values = sqlValues(queryRaw.mock.calls[0][0]);
    expect(values).toContain('11111111-1111-4111-8111-111111111111');
    expect(values).toContain(null);
  });

  it('returns the original case for an exact request-key retry', async () => {
    const existing = {
      id: '33333333-3333-4333-8333-333333333333',
      societyId: null,
      subjectUserId: '11111111-1111-4111-8111-111111111111',
      requestType: 'ACCESS',
      requestSummary: 'Provide a copy of my data',
      status: 'OPEN',
      requestKey: 'privacy-retry-123',
    };
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([existing]),
      $executeRaw: vi.fn(),
    };
    const prisma = { $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)) };
    const service = new PrivacyService(prisma as never);

    await expect(service.createMine(existing.subjectUserId, undefined, {
      requestType: 'ACCESS',
      requestSummary: 'Provide a copy of my data',
      requestKey: 'privacy-retry-123',
    })).resolves.toEqual(existing);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejects request-key reuse for another privacy request payload', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{
          societyId: null,
          requestType: 'ERASURE',
          requestSummary: 'Delete my data',
        }]),
      $executeRaw: vi.fn(),
    };
    const prisma = { $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)) };
    const service = new PrivacyService(prisma as never);

    await expect(service.createMine('11111111-1111-4111-8111-111111111111', undefined, {
      requestType: 'ACCESS',
      requestSummary: 'Provide a copy of my data',
      requestKey: 'privacy-retry-123',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('lists independent-home cases only from the society-less platform queue', async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const service = new PrivacyService({ $queryRaw: queryRaw } as never);

    await service.listPlatformCases();

    const query = queryRaw.mock.calls[0][0];
    expect(sqlText(query)).toContain('pc."societyId" IS NULL');
  });

  it('requires a nonblank self-service summary even if controller validation is bypassed', async () => {
    const service = new PrivacyService({} as never);
    await expect(service.createMine('11111111-1111-4111-8111-111111111111', undefined, {
      requestType: 'CORRECTION',
      requestSummary: '   ',
      requestKey: 'privacy-retry-123',
    })).rejects.toBeInstanceOf(BadRequestException);
  });
});
