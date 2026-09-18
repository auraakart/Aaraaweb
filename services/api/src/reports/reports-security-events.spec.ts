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
});
