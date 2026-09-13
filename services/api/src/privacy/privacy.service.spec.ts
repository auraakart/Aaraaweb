import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyService } from './privacy.service';

describe('PrivacyService', () => {
  it('rejects a privacy subject outside the current society', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new PrivacyService(prisma as unknown as PrismaService);

    await expect(
      service.createCase('society-1', 'admin-1', {
        subjectUserId: 'user-elsewhere',
        requestType: 'ACCESS',
        requestSummary: 'Provide my stored data',
      }),
    ).rejects.toThrow('Privacy request subject must be an active member of the current society');

    const membershipQuery = prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(membershipQuery.strings.join(' ')).toContain('"SocietyMembership"');
    expect(membershipQuery.values).toContain('society-1');
    expect(membershipQuery.values).toContain('user-elsewhere');
  });

  it('creates a case and append-only creation evidence after society validation', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'case-1', requestType: 'CORRECTION', status: 'OPEN' }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'membership-1' }]),
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new PrivacyService(prisma as unknown as PrismaService);

    await service.createCase('society-1', 'admin-1', {
      subjectUserId: 'user-1',
      requestType: 'CORRECTION',
      requestSummary: 'Correct mobile number',
    });

    const insert = tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(insert.strings.join(' ')).toContain('INSERT INTO "PrivacyRequestCase"');
    expect(insert.values).toContain('society-1');
    expect(insert.values).toContain('user-1');
    expect(insert.values).toContain('CORRECTION');

    const event = tx.$executeRaw.mock.calls[0][0] as { strings: readonly string[] };
    expect(event.strings.join(' ')).toContain("'CASE_CREATED'");
  });

  it('blocks completion of an erasure case while legal hold is active', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: 'case-1',
          societyId: 'society-1',
          requestType: 'ERASURE',
          status: 'IN_REVIEW',
          legalHold: true,
        },
      ]),
    };
    const service = new PrivacyService(prisma as unknown as PrismaService);

    await expect(service.updateStatus('society-1', 'admin-1', 'case-1', 'COMPLETED')).rejects.toThrow(
      'Erasure case cannot be completed while legal hold is active',
    );
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('requires a retention reason when enabling legal hold', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: 'case-1',
          societyId: 'society-1',
          requestType: 'ERASURE',
          status: 'OPEN',
          legalHold: false,
        },
      ]),
    };
    const service = new PrivacyService(prisma as unknown as PrismaService);

    await expect(service.updateLegalHold('society-1', 'admin-1', 'case-1', true)).rejects.toThrow(
      'Retention reason is required when legal hold is enabled',
    );
  });

  it('lists cases only inside the current society', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new PrivacyService(prisma as unknown as PrismaService);

    await service.listCases('society-1');

    const query = prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(query.strings.join(' ')).toContain('pc."societyId"');
    expect(query.values).toContain('society-1');
  });
});
