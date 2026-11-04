import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ReportsService } from './reports.service';

function sqlText(call: unknown[]) {
  return ((call[0] as readonly string[]) ?? []).join(' ');
}

describe('ReportsService security event feed', () => {
  it('keeps security events scoped to the current society', async () => {
    const queryRaw = vi.fn()
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{
        id: 'event-1',
        userId: 'user-1',
        sessionId: 'session-1',
        eventType: 'SESSION_REVOKED',
        reason: 'LOGOUT',
        occurredAt: new Date('2026-09-18T00:00:00Z'),
      }]);
    const service = new ReportsService({ $queryRaw: queryRaw } as never);

    const result = await service.securityEventFeed('11111111-1111-4111-8111-111111111111', 1, 50);

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(queryRaw).toHaveBeenCalledTimes(2);
    for (const call of queryRaw.mock.calls) {
      expect(sqlText(call)).toContain('"societyId" =');
      expect(call).toContain('11111111-1111-4111-8111-111111111111');
    }
  });

  it('applies validated date bounds to both count and page queries', async () => {
    const queryRaw = vi.fn().mockResolvedValueOnce([{ count: 0 }]).mockResolvedValueOnce([]);
    const service = new ReportsService({ $queryRaw: queryRaw } as never);

    await service.securityEventFeed(
      '11111111-1111-4111-8111-111111111111',
      1,
      50,
      undefined,
      '2026-09-01T00:00:00.000Z',
      '2026-09-18T23:59:59.000Z',
    );

    for (const call of queryRaw.mock.calls) {
      const sql = sqlText(call);
      expect(sql).toContain('"occurredAt" >=');
      expect(sql).toContain('"occurredAt" <=');
    }
  });

  it('rejects malformed event filters before querying', async () => {
    const queryRaw = vi.fn();
    const service = new ReportsService({ $queryRaw: queryRaw } as never);

    await expect(service.securityEventFeed(
      '11111111-1111-4111-8111-111111111111',
      1,
      50,
      'session revoked; drop table',
    )).rejects.toBeInstanceOf(BadRequestException);

    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('isolates count and page SQL parameters across sequential society switches', async () => {
    const a = '11111111-1111-4111-8111-111111111111';
    const b = '22222222-2222-4222-8222-222222222222';
    const queryRaw = vi.fn().mockImplementation(async (...params: unknown[]) => {
      const society = params[1] as string;
      const sql = sqlText(params);
      if (sql.includes('COUNT(*)')) return [{ count: society === a ? 1 : 2 }];
      return [{ id: society === a ? 'security-a' : 'security-b' }];
    });
    const service = new ReportsService({ $queryRaw: queryRaw } as never);
    const first = await service.securityEventFeed(a, 1, 10, 'SESSION_REVOKED');
    const second = await service.securityEventFeed(b, 2, 10, 'SESSION_REVOKED');
    expect(first.total).toBe(1);
    expect(second.total).toBe(2);
    expect(first.items).toEqual([{ id: 'security-a' }]);
    expect(second.items).toEqual([{ id: 'security-b' }]);
    expect(queryRaw).toHaveBeenCalledTimes(4);
    for (const [index, call] of queryRaw.mock.calls.entries()) {
      const selected = index < 2 ? a : b;
      const other = index < 2 ? b : a;
      expect(sqlText(call)).toContain('"societyId" =');
      expect(call).toContain(selected);
      expect(call).not.toContain(other);
      expect(call).toContain('SESSION_REVOKED');
    }
    expect(queryRaw.mock.calls[1]).toContain(0);
    expect(queryRaw.mock.calls[1]).toContain(10);
    expect(queryRaw.mock.calls[3]).toContain(10);
  });
});
