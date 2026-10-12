import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrivacyConsentService } from './privacy-consent.service';

describe('PrivacyConsentService', () => {
  function setup() {
    const tx = { $queryRaw: vi.fn(), $executeRaw: vi.fn() };
    const prisma = {
      $queryRaw: vi.fn(),
      withTenantContext: vi.fn(async (_societyId: string, callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    return { prisma, tx, service: new PrivacyConsentService(prisma as never) };
  }

  it('requires representative evidence when recording minor-data consent', async () => {
    const { prisma, service } = setup();

    await expect(service.record('society-1', 'actor-1', {
      subjectUserId: 'subject-1',
      purpose: 'Optional community photo publication',
      minorAtRecord: true,
      grantedAt: '2026-09-14T00:00:00.000Z',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates optional data categories within the current society', async () => {
    const { tx, service } = setup();
    tx.$queryRaw.mockResolvedValueOnce([{ userId: 'subject-1' }]).mockResolvedValueOnce([]);

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
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'consent-1', societyId: 'society-1', status: 'GRANTED' }]).mockResolvedValueOnce([{ id: 'consent-1', societyId: 'society-1', status: 'WITHDRAWN' }]);

    const result = await service.withdraw('society-1', 'actor-1', 'consent-1', 'Subject withdrew consent');
    expect(result.status).toBe('WITHDRAWN');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('uses only the society transaction client for consent listing and history', async () => {
    const { prisma, tx, service } = setup();
    tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'consent-1' }]).mockResolvedValueOnce([{ eventType: 'CONSENT_RECORDED' }]);
    expect(await service.list('society-1')).toEqual([]);
    expect(await service.history('society-1', 'consent-1')).toMatchObject([{ eventType: 'CONSENT_RECORDED' }]);
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(2);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    const queries = tx.$queryRaw.mock.calls.map(call => call[0] as { strings: readonly string[]; values: unknown[] });
    for (const sql of queries) expect(sql.values).toContain('society-1');
    expect(queries[0].strings.join(' ')).toContain('"PrivacyConsentRecord"');
    expect(queries[1].strings.join(' ')).toContain('"PrivacyConsentRecord"');
    expect(queries[2].strings.join(' ')).toContain('"PrivacyConsentEvent"');
  });

  it('validates subject, category, representative and creation evidence on the same client', async () => {
    const { prisma, tx, service } = setup();
    tx.$queryRaw.mockResolvedValueOnce([{ userId: 'subject-1' }])
      .mockResolvedValueOnce([{ code: 'PHOTOS' }])
      .mockResolvedValueOnce([{ userId: 'representative-1' }])
      .mockResolvedValueOnce([{ id: 'consent-1', status: 'GRANTED' }]);
    await expect(service.record('society-1', 'actor-1', {
      subjectUserId: 'subject-1', representativeUserId: 'representative-1',
      minorAtRecord: true, relationshipReference: 'Parent', purpose: 'Photographs',
      dataCategoryCode: 'PHOTOS', grantedAt: '2026-09-14T00:00:00.000Z',
    })).resolves.toMatchObject({ id: 'consent-1' });
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(4);
    const calls = tx.$queryRaw.mock.calls.map(call => (call[0] as { strings: readonly string[] }).strings.join(' '));
    expect(calls[0]).toContain('"SocietyMembership"');
    expect(calls[1]).toContain('"PrivacyDataCategory"');
    expect(calls[2]).toContain('"UnitOccupancy"');
    expect(calls[3]).toContain('INSERT INTO "PrivacyConsentRecord"');
  });

  it('rejects foreign consent history without querying its events', async () => {
    const { tx, service } = setup();
    tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.history('society-1', 'other-consent')).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('does not mutate or append duplicate evidence when consent is already withdrawn', async () => {
    const { prisma, tx, service } = setup();
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'consent-1', societyId: 'society-1', status: 'WITHDRAWN' }]);
    await expect(service.withdraw('society-1', 'actor-1', 'consent-1')).resolves.toMatchObject({ status: 'WITHDRAWN' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    const lock = tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[] };
    expect(lock.strings.join(' ')).toContain('FOR UPDATE');
  });

  it('rejects foreign consent withdrawal without attempting any update', async () => {
    const { tx, service } = setup();
    tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.withdraw('society-1', 'actor-1', 'foreign-consent')).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('propagates evidence failure from the same scoped creation transaction', async () => {
    const { tx, service } = setup();
    tx.$queryRaw.mockResolvedValueOnce([{ userId: 'subject-1' }])
      .mockResolvedValueOnce([{ id: 'consent-1' }]);
    tx.$executeRaw.mockRejectedValueOnce(new Error('evidence insert failed'));
    await expect(service.record('society-1', 'actor-1', {
      subjectUserId: 'subject-1', purpose: 'Optional', minorAtRecord: false,
      grantedAt: '2026-09-14T00:00:00.000Z',
    })).rejects.toThrow('evidence insert failed');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
