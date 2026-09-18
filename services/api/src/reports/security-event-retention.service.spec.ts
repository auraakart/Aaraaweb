import { afterEach, describe, expect, it, vi } from 'vitest';
import { SecurityEventRetentionService } from './security-event-retention.service';

afterEach(() => {
  delete process.env.SECURITY_EVENT_RETENTION_DAYS;
  delete process.env.SECURITY_EVENT_RETENTION_AUTO_PURGE;
});

describe('SecurityEventRetentionService', () => {
  it('deletes only events older than the configured retention cutoff', async () => {
    process.env.SECURITY_EVENT_RETENTION_DAYS = '365';
    const queryRaw = vi.fn().mockResolvedValue([]);
    const service = new SecurityEventRetentionService({ $queryRaw: queryRaw } as never);

    const result = await service.runOnce(new Date('2026-09-18T00:00:00.000Z'));

    expect(result.cutoff).toBe('2025-09-18T00:00:00.000Z');
    const call = queryRaw.mock.calls[0] as unknown[];
    expect(((call[0] as readonly string[]) ?? []).join('?')).toContain('WHERE "occurredAt" < ?');
    expect(call).toContainEqual(new Date('2025-09-18T00:00:00.000Z'));
  });

  it('fails closed on unsafe retention configuration', async () => {
    process.env.SECURITY_EVENT_RETENTION_DAYS = '7';
    const service = new SecurityEventRetentionService({ $queryRaw: vi.fn() } as never);
    await expect(service.runOnce()).rejects.toThrow('SECURITY_EVENT_RETENTION_DAYS must be an integer between 30 and 3650');
  });
});
