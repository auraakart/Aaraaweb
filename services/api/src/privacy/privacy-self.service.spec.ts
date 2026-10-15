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
    const prisma = { $queryRaw: vi.fn(), withTenantContext: vi.fn(async (_id: string, run: (client: { $queryRaw: typeof queryRaw }) => Promise<unknown>) => run({ $queryRaw: queryRaw })) };
    const service = new PrivacyService(prisma as never);

    await service.listMine(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    );

    const query = queryRaw.mock.calls[0][0];
    expect(sqlText(query)).toContain('"subjectUserId"=');
    expect(sqlText(query)).toContain('"societyId" IS NOT DISTINCT FROM');
    expect(sqlValues(query)).toContain('11111111-1111-4111-8111-111111111111');
    expect(sqlValues(query)).toContain('22222222-2222-4222-8222-222222222222');
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('supports an independent-home subject without inventing a society context', async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const prisma = { $queryRaw: vi.fn(), $transaction: vi.fn(async (run: (client: { $queryRaw: typeof queryRaw }) => Promise<unknown>) => run({ $queryRaw: queryRaw })), withTenantContext: vi.fn() };
    const service = new PrivacyService(prisma as never);

    await service.listMine('11111111-1111-4111-8111-111111111111');

    const values = sqlValues(queryRaw.mock.calls[0][0]);
    expect(values).toContain('11111111-1111-4111-8111-111111111111');
    expect(values).toContain(null);
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
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

  it('creates a society self-service request using tenant context and the same event transaction', async () => {
    const societyId = '22222222-2222-4222-8222-222222222222';
    const userId = '11111111-1111-4111-8111-111111111111';
    const tx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([])
        .mockResolvedValueOnce([{id:'33333333-3333-4333-8333-333333333333',societyId}]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = {
      $queryRaw: vi.fn(),
      $transaction: vi.fn(),
      withTenantContext: vi.fn(async (_id: string, run: (client: typeof tx) => Promise<unknown>) => run(tx)),
    };
    const service = new PrivacyService(prisma as never);
    const input = {requestType:'ACCESS' as const,requestSummary:'  View my information  ',requestKey:'scoped-self-123'};
    const created = await service.createMine(userId,societyId,input);
    expect(created).toMatchObject({societyId});
    expect(prisma.withTenantContext).toHaveBeenCalledWith(societyId,expect.any(Function));
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    const insert = tx.$queryRaw.mock.calls[2][0];
    expect(sqlValues(insert)).toContain('View my information');
    expect(sqlValues(insert)).toContain(societyId);
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(sqlText(tx.$executeRaw.mock.calls[0][0])).toContain('SELF_SERVICE_CREATED');
  });

  it('preserves cross-context request-key conflict when retrying from another society', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{
        societyId:'22222222-2222-4222-8222-222222222222',
        requestType:'ACCESS',requestSummary:'My data',
      }]),
      $executeRaw: vi.fn(),
    };
    const prisma = { withTenantContext: vi.fn(async (_id: string, run: (client: typeof tx) => Promise<unknown>) => run(tx)) };
    const service = new PrivacyService(prisma as never);
    await expect(service.createMine('11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
      {requestType:'ACCESS',requestSummary:'My data',requestKey:'globally-unique-key'}
    )).rejects.toBeInstanceOf(ConflictException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(1);
  });

  it('uses one society context client for self-service category and user consent views', async () => {
    const societyId = '22222222-2222-4222-8222-222222222222';
    const userId = '11111111-1111-4111-8111-111111111111';
    const tx = {$queryRaw: vi.fn()
      .mockResolvedValueOnce([{code:'CONTACT',name:'Contact',purpose:'Resident support',retentionTrigger:'Exit',retentionDays:90}])
      .mockResolvedValueOnce([{dataCategoryCode:'CONTACT',purpose:'Support',status:'GRANTED',grantedAt:new Date(),withdrawnAt:null}])};
    const prisma = { $queryRaw: vi.fn(), withTenantContext: vi.fn(async (_id:string,run:(client:typeof tx)=>Promise<unknown>)=>run(tx)) };
    const service = new PrivacyService(prisma as never);
    const result = await service.selfContext(userId,societyId);
    expect(result.categories).toHaveLength(1);
    expect(result.consents).toHaveLength(1);
    expect(result.activeConsentCount).toBe(1);
    expect(result.boundary).toContain('does not determine statutory rights');
    expect(prisma.withTenantContext).toHaveBeenCalledWith(societyId,expect.any(Function));
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(sqlValues(tx.$queryRaw.mock.calls[1][0])).toContain(userId);
    for(const [query] of tx.$queryRaw.mock.calls) expect(sqlValues(query)).toContain(societyId);
  });
});
