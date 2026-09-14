import { describe, expect, it, vi } from 'vitest';
import { ScheduledWorkService, resolveScheduledSweepIntervalMs, scheduledSweepsEnabled } from './scheduled-work.service';

describe('ScheduledWorkService', () => {
  it('bounds the configured interval and keeps a safe default', () => {
    expect(resolveScheduledSweepIntervalMs()).toBe(60_000);
    expect(resolveScheduledSweepIntervalMs('1000')).toBe(15_000);
    expect(resolveScheduledSweepIntervalMs('90000')).toBe(90_000);
    expect(resolveScheduledSweepIntervalMs('99999999')).toBe(3_600_000);
    expect(resolveScheduledSweepIntervalMs('invalid')).toBe(60_000);
  });

  it('supports an explicit operational kill switch', () => {
    expect(scheduledSweepsEnabled()).toBe(true);
    expect(scheduledSweepsEnabled('true')).toBe(false);
    expect(scheduledSweepsEnabled('1')).toBe(false);
    expect(scheduledSweepsEnabled('YES')).toBe(false);
  });

  it('skips when another replica holds the transaction advisory lock', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValueOnce([{ locked: false }]) };
    const prisma = { $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };
    const service = new ScheduledWorkService(prisma as never);

    await expect(service.runOnce()).resolves.toEqual({ skipped: true, reason: 'cluster-lock-held' });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('runs SLA state evaluation and first automatic escalation only after acquiring the cluster lock', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce([{ ticketId: '00000000-0000-0000-0000-000000000001' }])
        .mockResolvedValueOnce([{ ticketId: '00000000-0000-0000-0000-000000000002' }]),
    };
    const prisma = { $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };
    const service = new ScheduledWorkService(prisma as never);

    await expect(service.runOnce()).resolves.toEqual({ skipped: false, processed: 1, escalated: 1 });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    const escalationSql = (tx.$queryRaw.mock.calls[2][0] as { strings: readonly string[] }).strings.join(' ');
    expect(escalationSql).toContain('automaticEscalationEnabled');
    expect(escalationSql).toContain('"escalationLevel"=0');
  });
});
