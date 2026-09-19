import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HelpdeskSlaService } from './helpdesk-sla.service';

describe('HelpdeskSlaService', () => {

  it('orders the queue from the authoritative SLA expression instead of a select alias', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new HelpdeskSlaService(prisma as never);
    await service.listQueue('11111111-1111-4111-8111-111111111111');

    const query = prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[] };
    const sql = query.strings.join(' ');
    expect(sql).not.toContain('CASE "computedSlaState"');
    expect(sql.split('COALESCE(ht."resolvedAt", ht."closedAt")').length - 1)
      .toBeGreaterThanOrEqual(2);
  });

  it('rejects invalid policy ordering', async () => {
    const service = new HelpdeskSlaService({} as never);
    await expect(service.upsertPolicy('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',{
      priority:'HIGH', firstResponseMinutes:120, resolutionMinutes:60, escalationAfterMinutes:30,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires a target when automatic escalation is enabled', async () => {
    const service = new HelpdeskSlaService({} as never);
    await expect(service.upsertPolicy('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',{
      priority:'HIGH', firstResponseMinutes:30, resolutionMinutes:60, escalationAfterMinutes:15, automaticEscalationEnabled:true,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects configured automatic target outside current society', async () => {
    const prisma = { societyMembership: { findFirst: vi.fn().mockResolvedValue(null) } } as never;
    const service = new HelpdeskSlaService(prisma);
    await expect(service.upsertPolicy('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',{
      priority:'HIGH', firstResponseMinutes:30, resolutionMinutes:60, escalationAfterMinutes:15,
      automaticEscalationEnabled:true, escalationTargetUserId:'44444444-4444-4444-8444-444444444444',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects escalation target outside current society', async () => {
    const prisma = { societyMembership: { findFirst: vi.fn().mockResolvedValue(null) } } as never;
    const service = new HelpdeskSlaService(prisma);
    await expect(service.escalate(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444',
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it('writes escalation state and audit evidence in one transaction', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id:'ticket', status:'OPEN', slaState:'RESPONSE_BREACHED', escalationLevel:0 }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = {
      societyMembership: { findFirst: vi.fn().mockResolvedValue({ id:'membership' }) },
      $transaction: vi.fn(async (cb: (client: unknown) => unknown) => cb(tx)),
    } as never;
    const service = new HelpdeskSlaService(prisma);
    const result = await service.escalate(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','Escalate now',
    );
    expect(result).toMatchObject({ escalationLevel:1 });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('rejects policy application to unknown ticket', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const prisma = { $transaction: vi.fn(async (cb: (client: unknown) => unknown) => cb(tx)) } as never;
    const service = new HelpdeskSlaService(prisma);
    await expect(service.applyPolicy(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',
    )).rejects.toBeInstanceOf(NotFoundException);
  });

  it('computes resolved-after-deadline tickets as resolution breached', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{
          id:'ticket', status:'RESOLVED', slaState:'ON_TRACK', firstRespondedAt:new Date(), firstResponseDueAt:new Date(),
          resolutionDueAt:new Date('2026-09-14T08:00:00Z'), resolvedAt:new Date('2026-09-14T09:00:00Z'),
        }])
        .mockResolvedValueOnce([{ state:'RESOLUTION_BREACHED' }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { $transaction: vi.fn(async (cb: (client: unknown) => unknown) => cb(tx)) } as never;
    const service = new HelpdeskSlaService(prisma);

    await expect(service.evaluate(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',
    )).resolves.toMatchObject({ slaState:'RESOLUTION_BREACHED', changed:true });
  });

  it('uses closedAt when a ticket is closed without an intermediate resolved timestamp', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{
          id:'ticket', status:'CLOSED', slaState:'ON_TRACK', firstRespondedAt:new Date(),
          firstResponseDueAt:new Date('2026-09-14T08:00:00Z'),
          resolutionDueAt:new Date('2026-09-14T10:00:00Z'),
          resolvedAt:null, closedAt:new Date('2026-09-14T09:00:00Z'),
        }])
        .mockResolvedValueOnce([{ state:'MET' }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { $transaction: vi.fn(async (cb: (client: unknown) => unknown) => cb(tx)) } as never;
    const service = new HelpdeskSlaService(prisma);

    await expect(service.evaluate(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',
    )).resolves.toMatchObject({ slaState:'MET', changed:true });
  });

  it('reapplied policy preserves the computed overdue state in audit evidence', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id:'ticket', priority:'HIGH', createdAt:new Date(), status:'OPEN', slaState:'UNTRACKED' }])
        .mockResolvedValueOnce([{ firstResponseMinutes:30, resolutionMinutes:60 }])
        .mockResolvedValueOnce([{ id:'ticket', slaState:'RESOLUTION_BREACHED' }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { $transaction: vi.fn(async (cb: (client: unknown) => unknown) => cb(tx)) } as never;
    const service = new HelpdeskSlaService(prisma);

    await expect(service.applyPolicy(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',
    )).resolves.toMatchObject({ slaState:'RESOLUTION_BREACHED' });

    const eventSql = (tx.$executeRaw.mock.calls[0][0] as { values?: readonly unknown[] }).values ?? [];
    expect(eventSql).toContain('RESOLUTION_BREACHED');
  });
});
