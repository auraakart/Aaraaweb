import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrivacyConsentService } from './privacy-consent.service';

describe('PrivacyConsentService', () => {
  function setup() {
    const tx = { $queryRaw: vi.fn(), $executeRaw: vi.fn() };
    const prisma = {
      $queryRaw: vi.fn(),
      $transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    return { prisma, tx, service: new PrivacyConsentService(prisma as never) };
  }

  it('requires representative evidence when recording minor-data consent', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValue([{ userId: 'subject-1' }]);

    await expect(service.record('society-1', 'actor-1', {
      subjectUserId: 'subject-1',
      purpose: 'Optional community photo publication',
      minorAtRecord: true,
      grantedAt: '2026-09-14T00:00:00.000Z',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates optional data categories within the current society', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([{ userId: 'subject-1' }]).mockResolvedValueOnce([]);

    await expect(service.record('society-1', 'actor-1', {
      subjectUserId: 'subject-1',
      dataCategoryCode: 'OTHER_SOCIETY_CODE',
      purpose: 'Optional programme',
      minorAtRecord: false,
      grantedAt: '2026-09-14T00:00:00.000Z',
    })).rejects.toThrow('Consent data category must be active in the current society');
  });

  it('withdraws a granted consent and appends evidence', async () => {
    const { prisma, tx, service } = setup();
    prisma.$queryRaw.mockResolvedValue([{ id: 'consent-1', societyId: 'society-1', status: 'GRANTED' }]);
    tx.$queryRaw.mockResolvedValue([{ id: 'consent-1', societyId: 'society-1', status: 'WITHDRAWN' }]);

    const result = await service.withdraw('society-1', 'actor-1', 'consent-1', 'Subject withdrew consent');
    expect(result.status).toBe('WITHDRAWN');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
