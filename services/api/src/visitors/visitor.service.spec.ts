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
    $transaction: vi.fn(async (callback: (tx: typeof transactionClient) => Promise<unknown>) => callback(transactionClient)),
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
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
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
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.visitorPass.updateMany).toHaveBeenCalledWith({
      where: { societyId: 'society-1', visitorId: 'visitor-1', status: 'ACTIVE' },
      data: { status: 'REVOKED' },
    });
  });
});
