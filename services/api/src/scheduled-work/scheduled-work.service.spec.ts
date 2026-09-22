import { describe, expect, it, vi } from 'vitest';
import {
  ScheduledWorkService,
  noticeDispatchRetryDelayMinutes,
  resolveScheduledSweepIntervalMs,
  scheduledSweepsEnabled,
} from './scheduled-work.service';

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

  it('backs off notice dispatch retries without exceeding one hour', () => {
    expect(noticeDispatchRetryDelayMinutes(1)).toBe(1);
    expect(noticeDispatchRetryDelayMinutes(2)).toBe(2);
    expect(noticeDispatchRetryDelayMinutes(7)).toBe(60);
    expect(noticeDispatchRetryDelayMinutes(20)).toBe(60);
  });

  it('skips an overlapping sweep in the same process before starting another transaction', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => {
        await gate;
        return callback(tx);
      }),
      $executeRaw: vi.fn(),
    };
    const service = new ScheduledWorkService(prisma as never);

    const firstRun = service.runOnce();
    await Promise.resolve();
    await expect(service.runOnce()).resolves.toEqual({ skipped: true, reason: 'local-run-active' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    release();
    await expect(firstRun).resolves.toMatchObject({ skipped: false });
  });

  it('skips when another replica holds the transaction advisory lock', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValueOnce([{ locked: false }]) };
    const prisma = { $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };
    const service = new ScheduledWorkService(prisma as never);

    await expect(service.runOnce()).resolves.toEqual({ skipped: true, reason: 'cluster-lock-held' });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('runs helpdesk, SOS and notice automation only after acquiring the cluster lock', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce([{ ticketId: '00000000-0000-0000-0000-000000000001' }])
        .mockResolvedValueOnce([{ ticketId: '00000000-0000-0000-0000-000000000002' }])
        .mockResolvedValueOnce([{ incidentId: '00000000-0000-0000-0000-000000000003' }])
        .mockResolvedValueOnce([]),
    };
    const prisma = {
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      $executeRaw: vi.fn(),
    };
    const service = new ScheduledWorkService(prisma as never);

    await expect(service.runOnce()).resolves.toEqual({
      skipped: false,
      processed: 1,
      escalated: 1,
      sosEscalated: 1,
      noticeDispatched: 0,
      noticeDispatchFailed: 0,
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(5);
    const sosSql = (tx.$queryRaw.mock.calls[3][0] as { strings: readonly string[] }).strings.join(' ');
    expect(sosSql).toContain('"acknowledgeDueAt" <= CURRENT_TIMESTAMP');
    expect(sosSql).toContain("'AUTOMATION','ESCALATED'");
    const noticeSql = (tx.$queryRaw.mock.calls[4][0] as { strings: readonly string[] }).strings.join(' ');
    expect(noticeSql).toContain('"NoticeDispatch"');
    expect(noticeSql).toContain('FOR UPDATE OF nd SKIP LOCKED');
    expect(noticeSql).toContain('make_interval(mins =>');
    expect(noticeSql).toContain('::int)');
  });

  it('keeps repeated scheduled ticks state-idempotent at the database boundary', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    };
    const prisma = {
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      $executeRaw: vi.fn(),
    };
    const service = new ScheduledWorkService(prisma as never);

    await expect(service.runOnce()).resolves.toMatchObject({ skipped: false });
    const changedSql = (tx.$queryRaw.mock.calls[1][0] as { strings: readonly string[] }).strings.join(' ');
    expect(changedSql).toContain('c."toState" <> c."fromState"');

    const escalationSql = (tx.$queryRaw.mock.calls[2][0] as { strings: readonly string[] }).strings.join(' ');
    expect(escalationSql).toContain('ht."escalationLevel"=0');
    expect(escalationSql).toContain('AND ht."escalationLevel"=0');

    const sosSql = (tx.$queryRaw.mock.calls[3][0] as { strings: readonly string[] }).strings.join(' ');
    expect(sosSql).toContain('si."autoEscalatedAt" IS NULL');
    expect(sosSql).toContain('AND si."autoEscalatedAt" IS NULL');

    const noticeSql = (tx.$queryRaw.mock.calls[4][0] as { strings: readonly string[] }).strings.join(' ');
    expect(noticeSql).toContain('nd."status"=\'PENDING\'');
    expect(noticeSql).toContain('nd."status"=\'IN_FLIGHT\'');
    expect(noticeSql).toContain('FOR UPDATE OF nd SKIP LOCKED');
    expect(noticeSql).toContain('SET "status"=\'IN_FLIGHT\'');
  });

  it('drains durable direct-push work after the cluster-owned sweep', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    };
    const prisma = {
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      $executeRaw: vi.fn(),
    };
    const push = { drainDurableOutbox: vi.fn().mockResolvedValue({ dispatched: 2, deferred: 1, failed: 0, claimed: 3 }) };
    const service = new ScheduledWorkService(prisma as never, undefined, push as never);

    await expect(service.runOnce()).resolves.toMatchObject({
      pushDispatched: 2,
      pushDeferred: 1,
      pushFailed: 0,
      pushClaimed: 3,
    });
    expect(push.drainDurableOutbox).toHaveBeenCalledOnce();
  });

  it('dispatches due scheduled notices and records successful handoff', async () => {
    const dispatchId = '00000000-0000-4000-8000-000000000010';
    const societyId = '00000000-0000-4000-8000-000000000011';
    const noticeId = '00000000-0000-4000-8000-000000000012';
    const userId = '00000000-0000-4000-8000-000000000013';
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ dispatchId, societyId, noticeId, userId, title: 'Water update', body: 'Supply resumes at 6 PM', attemptCount: 1 }]),
    };
    const prisma = {
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const realtime = { dispatchResident: vi.fn().mockResolvedValue(undefined) };
    const service = new ScheduledWorkService(prisma as never, realtime as never);

    await expect(service.runOnce()).resolves.toMatchObject({ noticeDispatched: 1, noticeDispatchFailed: 0 });
    expect(realtime.dispatchResident).toHaveBeenCalledWith(expect.objectContaining({
      type: 'GENERAL_NOTICE_PUBLISHED', societyId, noticeId, userId,
    }));
    const successSql = (prisma.$executeRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(successSql).toContain("'DISPATCHED'");
    expect(successSql).toContain('"status"=\'IN_FLIGHT\'');
  });

  it('returns failed notice delivery to a durable retry state with backoff', async () => {
    const dispatchId = '00000000-0000-4000-8000-000000000020';
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{
          dispatchId,
          societyId: '00000000-0000-4000-8000-000000000021',
          noticeId: '00000000-0000-4000-8000-000000000022',
          userId: '00000000-0000-4000-8000-000000000023',
          title: 'Retry notice',
          body: 'Retry body',
          attemptCount: 2,
        }]),
    };
    const prisma = {
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const realtime = { dispatchResident: vi.fn().mockRejectedValue(new Error('transport unavailable')) };
    const service = new ScheduledWorkService(prisma as never, realtime as never);

    await expect(service.runOnce()).resolves.toMatchObject({ noticeDispatched: 0, noticeDispatchFailed: 1 });
    const retrySql = (prisma.$executeRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(retrySql).toContain('"status"=\'PENDING\'');
    expect(retrySql).toContain('"nextAttemptAt"=CURRENT_TIMESTAMP + make_interval');
    expect(retrySql).toContain('::int)');
    expect(retrySql).toContain('"status"=\'IN_FLIGHT\'');
  });
});
