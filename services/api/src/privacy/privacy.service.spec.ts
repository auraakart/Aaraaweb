import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyService } from './privacy.service';

describe('PrivacyService', () => {
  it('rejects a privacy subject with no current or historical society relationship', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]), $executeRaw: vi.fn() };
    const prisma = { $queryRaw: vi.fn(), withTenantContext: vi.fn(async (_societyId: string, callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) };
    const service = new PrivacyService(prisma as unknown as PrismaService);

    await expect(
      service.createCase('society-1', 'admin-1', {
        subjectUserId: 'user-elsewhere',
        requestType: 'ACCESS',
        requestSummary: 'Provide my stored data',
      }),
    ).rejects.toThrow('Privacy request subject has no current or historical relationship with this society');

    const relationshipQuery = tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    const sql = relationshipQuery.strings.join(' ');
    expect(sql).toContain('"SocietyMembership"');
    expect(sql).toContain('"UnitOwnership"');
    expect(sql).toContain('"UnitOccupancy"');
    expect(sql).not.toContain('"active" = true');
    expect(relationshipQuery.values).toContain('society-1');
    expect(relationshipQuery.values).toContain('user-elsewhere');
  });

  it('creates a case and append-only creation evidence after society validation', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{ userId: 'user-1' }]).mockResolvedValueOnce([{ id: 'case-1', requestType: 'CORRECTION', status: 'OPEN' }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = {
      $queryRaw: vi.fn(),
      withTenantContext: vi.fn(async (_societyId: string, callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new PrivacyService(prisma as unknown as PrismaService);

    await service.createCase('society-1', 'admin-1', {
      subjectUserId: 'user-1',
      requestType: 'CORRECTION',
      requestSummary: 'Correct mobile number',
    });

    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    const insert = tx.$queryRaw.mock.calls[1][0] as { strings: readonly string[]; values: unknown[] };
    expect(insert.strings.join(' ')).toContain('INSERT INTO "PrivacyRequestCase"');
    expect(insert.values).toContain('society-1');
    expect(insert.values).toContain('user-1');
    expect(insert.values).toContain('CORRECTION');

    const event = tx.$executeRaw.mock.calls[0][0] as { strings: readonly string[] };
    expect(event.strings.join(' ')).toContain("'CASE_CREATED'");
  });

  it('blocks completion of an erasure case while legal hold is active', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([
        {
          id: 'case-1',
          societyId: 'society-1',
          requestType: 'ERASURE',
          status: 'IN_REVIEW',
          legalHold: true,
        },
      ]), $executeRaw: vi.fn() };
    const prisma = { $queryRaw: vi.fn(), withTenantContext: vi.fn(async (_id: string, cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new PrivacyService(prisma as unknown as PrismaService);

    await expect(service.updateStatus('society-1', 'admin-1', 'case-1', 'COMPLETED')).rejects.toThrow(
      'Erasure case cannot be completed while legal hold is active',
    );
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('requires a retention reason when enabling legal hold', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([
        {
          id: 'case-1',
          societyId: 'society-1',
          requestType: 'ERASURE',
          status: 'OPEN',
          legalHold: false,
        },
      ]), $executeRaw: vi.fn() };
    const prisma = { $queryRaw: vi.fn(), withTenantContext: vi.fn(async (_id: string, cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new PrivacyService(prisma as unknown as PrismaService);

    await expect(service.updateLegalHold('society-1', 'admin-1', 'case-1', true)).rejects.toThrow(
      'Retention reason is required when legal hold is enabled',
    );
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('lists cases only inside the current society', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const prisma = { $queryRaw: vi.fn(), withTenantContext: vi.fn(async (_societyId: string, callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) };
    const service = new PrivacyService(prisma as unknown as PrismaService);

    await service.listCases('society-1');

    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    const query = tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(query.strings.join(' ')).toContain('pc."societyId"');
    expect(query.values).toContain('society-1');
  });

  it('validates an active assignee in the same tenant transaction before insert', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValueOnce([{ userId: 'resident-1' }]).mockResolvedValueOnce([]), $executeRaw: vi.fn() };
    const prisma = { $queryRaw: vi.fn(), withTenantContext: vi.fn(async (_id: string, cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new PrivacyService(prisma as unknown as PrismaService);
    await expect(service.createCase('society-1', 'admin-1', {
      subjectUserId: 'resident-1', requestType: 'ACCESS', requestSummary: 'Data access', assignedToUserId: 'other-society-admin',
    })).rejects.toThrow('Privacy case assignee must be an active member of the current society');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    const query = tx.$queryRaw.mock.calls[1][0] as { values: unknown[]; strings: readonly string[] };
    expect(query.strings.join(' ')).toContain('"active" = true');
    expect(query.values).toContain('society-1');
  });

  it('uses one tenant client for relationship checks, case insertion and evidence', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValueOnce([{ userId: 'resident-1' }])
      .mockResolvedValueOnce([{ id: 'membership-1' }]).mockResolvedValueOnce([{ id: 'case-1' }]),
      $executeRaw: vi.fn().mockResolvedValue(1) };
    const prisma = { $queryRaw: vi.fn(), withTenantContext: vi.fn(async (_id: string, cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new PrivacyService(prisma as unknown as PrismaService);
    await expect(service.createCase('society-1', 'admin-1', {
      subjectUserId: 'resident-1', requestType: 'ERASURE', requestSummary: 'Erase retained data',
      assignedToUserId: 'operator-1',
    })).resolves.toMatchObject({ id: 'case-1' });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
  });

  it('propagates failed audit evidence insertion inside the case transaction', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValueOnce([{ userId: 'resident-1' }]).mockResolvedValueOnce([{ id: 'case-1' }]),
      $executeRaw: vi.fn().mockRejectedValueOnce(new Error('audit unavailable')) };
    const prisma = { withTenantContext: vi.fn(async (_id: string, cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new PrivacyService(prisma as unknown as PrismaService);
    await expect(service.createCase('society-1', 'admin-1', {
      subjectUserId: 'resident-1', requestType: 'ACCESS', requestSummary: 'My data',
    })).rejects.toThrow('audit unavailable');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });

  it('authorizes case history parent and events on the same society client', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValueOnce([{ id: 'case-1' }])
      .mockResolvedValueOnce([{ eventType: 'CASE_CREATED' }]) };
    const prisma = { $queryRaw: vi.fn(), withTenantContext: vi.fn(async (_id: string, cb: (client: typeof tx) => unknown) => cb(tx)),
      $transaction: vi.fn() };
    const service = new PrivacyService(prisma as unknown as PrismaService);
    await expect(service.history('society-1', 'case-1')).resolves.toMatchObject([{ eventType: 'CASE_CREATED' }]);
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    for (const [query] of tx.$queryRaw.mock.calls) expect((query as { values: unknown[] }).values).toContain('society-1');
  });

  it('rejects foreign case history before reading foreign evidence', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValueOnce([]) };
    const prisma = { withTenantContext: vi.fn(async (_id: string, cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new PrivacyService(prisma as unknown as PrismaService);
    await expect(service.history('society-1', 'foreign-case')).rejects.toThrow('Privacy request case not found');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('preserves independent-home history using an unscoped transaction', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValueOnce([{ id: 'personal-case' }]).mockResolvedValueOnce([]) };
    const prisma = { withTenantContext: vi.fn(), $transaction: vi.fn(async (cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new PrivacyService(prisma as unknown as PrismaService);
    await expect(service.history(undefined, 'personal-case')).resolves.toEqual([]);
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const query = tx.$queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(query.values).toContain(null);
  });
});
