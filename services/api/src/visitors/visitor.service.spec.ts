import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { VisitorService } from './visitor.service';

type Overrides = Record<string, unknown>;

function service(overrides: Overrides = {}) {
  const unitOccupancy = {
    findFirst: vi.fn().mockResolvedValue({ id: 'link-1' }),
    ...((overrides.unitOccupancy as Record<string, unknown> | undefined) ?? {}),
  };
  const visitor = {
    create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'visitor-1', ...data })),
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue({ id: 'visitor-1', societyId: 'society-1', hostUserId: 'host-1', status: 'PENDING' }),
    update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'visitor-1', ...data })),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'visitor-1', societyId: 'society-1', hostUserId: 'host-1', status: 'APPROVED' }),
    ...((overrides.visitor as Record<string, unknown> | undefined) ?? {}),
  };
  const visitorPass = {
    create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'pass-1', ...data })),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    ...((overrides.visitorPass as Record<string, unknown> | undefined) ?? {}),
  };
  const transactionClient = { unitOccupancy, visitor, visitorPass };
  const prisma = {
    unitOccupancy,
    visitor,
    visitorPass,
    withTenantContext: vi.fn(async (_societyId: string, callback: (tx: typeof transactionClient) => Promise<unknown>) => callback(transactionClient)),
  };
  return {
    svc: new VisitorService(prisma as unknown as ConstructorParameters<typeof VisitorService>[0]),
    prisma,
  };
}

describe('VisitorService', () => {
  it('creates a pending visitor request for an active resident unit', async () => {
    const { svc, prisma } = service();
    const result = await svc.createRequest('society-1', 'host-1', 'unit-1', 'Visitor', '9999999999', 'Delivery');
    expect(result.status).toBe('PENDING');
    expect(prisma.visitorPass.create).not.toHaveBeenCalled();
  });

  it('rejects visitor creation for a unit not linked to the host', async () => {
    const { svc } = service({ unitOccupancy: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(svc.createRequest('society-1', 'host-1', 'unit-x', 'Visitor')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('approves a pending visitor and issues an active pass', async () => {
    const { svc, prisma } = service();
    const result = await svc.approve(
      'society-1',
      'host-1',
      'visitor-1',
      new Date(Date.now() - 1_000),
      new Date(Date.now() + 60_000),
    );
    expect(result.visitor.status).toBe('APPROVED');
    expect(result.pass.status).toBe('ACTIVE');
    expect(typeof result.credential).toBe('string');
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(1);
    expect(prisma.visitor.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.visitorPass.create).toHaveBeenCalledTimes(1);
  });

  it('prevents a different resident from approving the visitor', async () => {
    const { svc } = service({ visitor: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(
      svc.approve('society-1', 'other-host', 'visitor-1', new Date(), new Date(Date.now() + 60_000)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('denies only pending visitor requests', async () => {
    const { svc } = service({
      visitor: {
        findFirst: vi.fn().mockResolvedValue({ id: 'visitor-1', status: 'APPROVED' }),
      },
    });
    await expect(svc.deny('society-1', 'host-1', 'visitor-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('revokes active passes when a resident cancels an approved visit', async () => {
    const { svc, prisma } = service({
      visitor: {
        findFirst: vi.fn().mockResolvedValue({ id: 'visitor-1', status: 'APPROVED' }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'visitor-1', status: 'CANCELLED' }),
      },
    });
    const result = await svc.cancel('society-1', 'host-1', 'visitor-1');
    expect(result.status).toBe('CANCELLED');
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(1);
    expect(prisma.visitorPass.updateMany).toHaveBeenCalledWith({
      where: { societyId: 'society-1', visitorId: 'visitor-1', status: 'ACTIVE' },
      data: { status: 'REVOKED' },
    });
  });
  it('issues a trimmed preapproved pass without exposing the credential hash as the credential', async () => {
    const { svc, prisma } = service();
    const result = await svc.createPass('society-1', 'host-1', 'unit-1', ' Visitor ', ' 999 ', new Date(0), new Date(Date.now() + 60_000));
    expect(result.visitor).toMatchObject({ name: 'Visitor', phone: '999', status: 'APPROVED' });
    expect(result.pass.credentialHash).not.toBe(result.credential);
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(1);
    await svc.listForHost('society-1', 'host-1');
    expect(prisma.visitor.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { societyId: 'society-1', hostUserId: 'host-1' },
      include: { passes: { where: { societyId: 'society-1' }, orderBy: { createdAt: 'desc' }, take: 1 } },
    }));
  });

  it('normalizes omitted and blank request metadata', async () => {
    const { svc } = service();
    for (const metadata of [undefined, '   ']) {
      expect(await svc.createRequest('society-1', 'host-1', 'unit-1', ' Visitor ', metadata, metadata))
        .toMatchObject({ name: 'Visitor', phone: null, purpose: null });
    }
  });

  it.each(['createPass', 'approve'] as const)('rejects invalid %s validity before writing', async method => {
    const { svc, prisma } = service();
    await expect(method === 'createPass'
      ? svc.createPass('society-1', 'host-1', 'unit-1', 'Visitor', '999', new Date(1), new Date(0))
      : svc.approve('society-1', 'host-1', 'visitor-1', new Date(1), new Date(0))).rejects.toThrow('validity window');
    expect(prisma.visitorPass.create).not.toHaveBeenCalled();
  });

  it.each(['approve', 'deny', 'cancel'] as const)('denies missing or concurrently changed %s requests', async method => {
    for (const missing of [true, false]) {
      const { svc, prisma } = service({ visitor: missing ? { findFirst: vi.fn().mockResolvedValue(null) } : { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } });
      await expect(svc[method]('society-1', 'host-1', 'visitor-1', new Date(0), new Date(Date.now() + 60_000)))
        .rejects.toThrow(missing ? 'not found' : 'changed before');
      expect(prisma.visitorPass.create).not.toHaveBeenCalled();
      expect(prisma.visitorPass.updateMany).not.toHaveBeenCalled();
    }
  });

  it.each(['approve', 'deny', 'cancel'] as const)('preserves %s state guards', async method => {
    const { svc } = service({ visitor: { findFirst: vi.fn().mockResolvedValue({ id: 'visitor-1', status: 'CHECKED_IN' }) } });
    await expect(svc[method]('society-1', 'host-1', 'visitor-1', new Date(0), new Date(Date.now() + 60_000)))
      .rejects.toThrow('checked_in');
  });

  it('denies a pending request in one context', async () => {
    const { svc, prisma } = service();
    await svc.deny('society-1', 'host-1', 'visitor-1');
    expect(prisma.visitor.updateMany).toHaveBeenCalledWith({ where: { id: 'visitor-1', societyId: 'society-1', hostUserId: 'host-1', status: 'PENDING' }, data: { status: 'DENIED' } });
  });

});
