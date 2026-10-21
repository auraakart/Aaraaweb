import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { UniversalSearchService, universalSearchCapabilities } from './universal-search.service';

describe('universalSearchCapabilities', () => {
  it('keeps resident search own-scoped without society-wide operations access', () => {
    const owner = universalSearchCapabilities([AppRole.OWNER]);
    expect(owner.members).toBe(false);
    expect(owner.accessSociety).toBe(false);
    expect(owner.accessOwn).toBe(true);
    expect(owner.financeSociety).toBe(false);
    expect(owner.financeOwn).toBe(true);
    expect(owner.helpdeskOwn).toBe(true);
    expect(owner.notices).toBe(true);
    expect(owner.noticesSociety).toBe(false);
    expect(owner.services).toBe(true);
    expect(owner.assets).toBe(false);
  });

  it('allows society admin search only through its existing domain permissions', () => {
    const admin = universalSearchCapabilities([AppRole.SOCIETY_ADMIN]);
    expect(admin.members).toBe(true);
    expect(admin.accessSociety).toBe(true);
    expect(admin.financeSociety).toBe(true);
    expect(admin.helpdeskSociety).toBe(true);
    expect(admin.noticesSociety).toBe(true);
    expect(admin.assets).toBe(true);
  });
});

describe('UniversalSearchService property boundary', () => {
  it('requires selected property context for resident-owned search', async () => {
    const prisma = { $queryRaw: vi.fn(), serviceOffering: { findMany: vi.fn() } };
    const service = new UniversalSearchService(prisma as never);
    await expect(service.search('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', [AppRole.OWNER], 'guest'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('fails closed when requested unit is not owned or occupied by authenticated resident', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]), serviceOffering: { findMany: vi.fn() } };
    const service = new UniversalSearchService(prisma as never);
    await expect(service.search(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      [AppRole.OWNER],
      'guest',
      '33333333-3333-3333-3333-333333333333',
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe('Helpdesk reference in universal search', () => {
  it('searches the number within society scope and includes it in the result', async () => {
    const prisma = {
      $queryRaw: vi.fn(async (query: { sql: string }) => query.sql.includes('FROM "HelpdeskTicket"')
        ? [{id:'ticket-1',ticketNumber:'HD-2026-000123',title:'Water leak',category:'PLUMBING',status:'OPEN'}] : []),
      serviceOffering: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const result = await new UniversalSearchService(prisma as never).search(
      '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
      [AppRole.SOCIETY_ADMIN], 'HD-2026-000123',
    );
    expect(result.results.find(row => row.type === 'HELPDESK')?.subtitle).toBe('HD-2026-000123 · PLUMBING · OPEN');
    const query = prisma.$queryRaw.mock.calls.map(call=>call[0]).find(query=>query.sql.includes('FROM "HelpdeskTicket"'));
    expect(query?.sql).toContain('ht."ticketNumber" ILIKE');
    expect(query?.sql).toContain('ht."societyId"=');
  });
});
