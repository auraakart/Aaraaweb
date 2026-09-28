import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { HelpdeskService } from './helpdesk.service';

describe('HelpdeskService', () => {
  it('authorizes household tickets through current occupancy, never legacy residency', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new HelpdeskService(prisma as unknown as PrismaService);
    await service.listMine('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
    const query = prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[] };
    const sql = query.strings.join(' ');
    expect(sql).toContain('"UnitOccupancy"');
    expect(sql).toContain('"effectiveFrom" <= CURRENT_TIMESTAMP');
    expect(sql).not.toContain('"UnitResident"');
  });

  it('rejects invalid ticket title before writing', async () => {
    const prisma = { $queryRaw: vi.fn(), $transaction: vi.fn() };
    const service = new HelpdeskService(prisma as unknown as PrismaService);

    await expect(
      service.createMine('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', {
        unitId: '33333333-3333-3333-3333-333333333333',
        idempotencyKey: 'helpdesk-test-invalid-title',
        title: 'x',
        description: 'Water leakage near kitchen sink',
      }),
    ).rejects.toThrow('Title must be between 3 and 120 characters');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns generic not-found when resident does not own the requested unit', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]), $transaction: vi.fn() };
    const service = new HelpdeskService(prisma as unknown as PrismaService);

    await expect(
      service.createMine('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', {
        unitId: '33333333-3333-3333-3333-333333333333',
        idempotencyKey: 'helpdesk-test-unit-scope',
        title: 'Water leakage',
        description: 'Water leakage near kitchen sink',
      }),
    ).rejects.toThrow('Unit not found');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns the original complaint for an exact same-key replay without a second create event', async () => {
    const existing = {
      id:'44444444-4444-4444-4444-444444444444',
      societyId:'11111111-1111-1111-1111-111111111111',
      unitId:'33333333-3333-3333-3333-333333333333',
      createdById:'22222222-2222-2222-2222-222222222222',
      idempotencyKey:'resident-helpdesk-attempt-1',
      title:'Water leakage',description:'Water leakage near kitchen sink',category:'Plumbing',
      priority:'HIGH',status:'OPEN',assignedToId:null,resolvedAt:null,closedAt:null,createdAt:new Date(),updatedAt:new Date(),
    };
    const tx={$queryRaw:vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([existing]),$executeRaw:vi.fn()};
    const prisma={$queryRaw:vi.fn().mockResolvedValue([{id:'occupancy-1'}]),$transaction:vi.fn(async(cb:(client:typeof tx)=>unknown)=>cb(tx))};
    const service=new HelpdeskService(prisma as unknown as PrismaService);
    const result=await service.createMine(existing.societyId,existing.createdById,{
      unitId:existing.unitId,idempotencyKey:existing.idempotencyKey,title:'  Water leakage  ',
      description:existing.description,category:' Plumbing ',priority:'HIGH',
    });
    expect(result.id).toBe(existing.id);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejects a same-key replay when normalized complaint intent changes', async () => {
    const existing = {
      id:'44444444-4444-4444-4444-444444444444',
      societyId:'11111111-1111-1111-1111-111111111111',
      unitId:'33333333-3333-3333-3333-333333333333',
      createdById:'22222222-2222-2222-2222-222222222222',
      idempotencyKey:'resident-helpdesk-attempt-2',
      title:'Water leakage',description:'Water leakage near kitchen sink',category:null,
      priority:'NORMAL',status:'OPEN',assignedToId:null,resolvedAt:null,closedAt:null,createdAt:new Date(),updatedAt:new Date(),
    };
    const tx={$queryRaw:vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([existing]),$executeRaw:vi.fn()};
    const prisma={$queryRaw:vi.fn().mockResolvedValue([{id:'occupancy-1'}]),$transaction:vi.fn(async(cb:(client:typeof tx)=>unknown)=>cb(tx))};
    const service=new HelpdeskService(prisma as unknown as PrismaService);
    await expect(service.createMine(existing.societyId,existing.createdById,{
      unitId:existing.unitId,idempotencyKey:existing.idempotencyKey,title:existing.title,
      description:'A different issue description',priority:'NORMAL',
    })).rejects.toThrow('Idempotency key already used for a different complaint');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('does not expose activity history for a ticket outside resident ownership', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new HelpdeskService(prisma as unknown as PrismaService);

    await expect(
      service.activitiesMine(
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '44444444-4444-4444-4444-444444444444',
      ),
    ).rejects.toThrow('Helpdesk ticket not found');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('filters internal staff notes from resident activity history', async () => {
    const prisma = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: '44444444-4444-4444-4444-444444444444' }])
        .mockResolvedValueOnce([]),
    };
    const service = new HelpdeskService(prisma as unknown as PrismaService);

    await service.activitiesMine(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      '44444444-4444-4444-4444-444444444444',
    );

    const query = prisma.$queryRaw.mock.calls[1][0] as { strings: readonly string[] };
    expect(query.strings.join(' ')).toContain('ha."type" <> \'INTERNAL_NOTE\'');
  });

  it('requires a structured resolution reason before resolving a ticket', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{
        id: '44444444-4444-4444-4444-444444444444',
        societyId: '11111111-1111-1111-1111-111111111111',
        status: 'OPEN',
        resolutionCode: null,
        closureCode: null,
      }]),
      $transaction: vi.fn(),
    };
    const service = new HelpdeskService(prisma as unknown as PrismaService);

    await expect(
      service.updateStatus(
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '44444444-4444-4444-4444-444444444444',
        'RESOLVED',
        'Repair completed',
      ),
    ).rejects.toThrow('A valid resolution code is required');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('scopes resident reopen to current occupancy inside the locked transaction', async () => {
    const tx = {$queryRaw: vi.fn().mockResolvedValue([]), $executeRaw: vi.fn()};
    const prisma = {$transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))};
    const service = new HelpdeskService(prisma as unknown as PrismaService);

    await expect(service.reopenMine(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      '44444444-4444-4444-4444-444444444444',
      'The leak has returned',
    )).rejects.toThrow('Helpdesk ticket not found');

    const query = tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[] };
    const sql = query.strings.join(' ');
    expect(sql).toContain('"UnitOccupancy"');
    expect(sql).toContain('uo."userId" =');
    expect(sql).toContain('uo."active" = true');
    expect(sql).toContain('"effectiveFrom" <= CURRENT_TIMESTAMP');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('records an audited REOPENED event for an owned resolved ticket', async () => {
    const current = {
      id:'44444444-4444-4444-4444-444444444444',
      societyId:'11111111-1111-1111-1111-111111111111',
      unitId:'33333333-3333-3333-3333-333333333333',
      createdById:'22222222-2222-2222-2222-222222222222',
      title:'Water leak',description:'Leak near kitchen sink',category:null,priority:'HIGH',
      status:'RESOLVED',assignedToId:null,resolutionCode:'FIXED',closureCode:null,
      resolvedAt:new Date(),closedAt:null,createdAt:new Date(),updatedAt:new Date(),
    };
    const updated = {...current,status:'IN_PROGRESS',resolutionCode:null,resolvedAt:null};
    const tx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([current]).mockResolvedValueOnce([updated]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = {$transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))};
    const service = new HelpdeskService(prisma as unknown as PrismaService);

    const result = await service.reopenMine(current.societyId,current.createdById,current.id,'The leak has returned');
    expect(result.status).toBe('IN_PROGRESS');
    const activity = tx.$executeRaw.mock.calls[0][0] as { strings: readonly string[] };
    expect(activity.strings.join(' ')).toContain("'REOPENED'");
  });
});
