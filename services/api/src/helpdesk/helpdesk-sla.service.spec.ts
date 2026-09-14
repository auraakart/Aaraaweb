import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HelpdeskSlaService } from './helpdesk-sla.service';

describe('HelpdeskSlaService', () => {
  it('rejects invalid policy ordering', async () => {
    const service = new HelpdeskSlaService({} as never);
    await expect(service.upsertPolicy('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',{
      priority:'HIGH', firstResponseMinutes:120, resolutionMinutes:60, escalationAfterMinutes:30,
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
      $transaction: vi.fn(async (cb: (tx: typeof tx) => unknown) => cb(tx)),
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
    const prisma = { $transaction: vi.fn(async (cb: (tx: typeof tx) => unknown) => cb(tx)) } as never;
    const service = new HelpdeskSlaService(prisma);
    await expect(service.applyPolicy(
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',
    )).rejects.toBeInstanceOf(NotFoundException);
  });
});
