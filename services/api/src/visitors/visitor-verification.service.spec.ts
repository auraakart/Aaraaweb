import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { VisitorVerificationService } from './visitor-verification.service';

const pass = {
  id: 'pass-1',
  visitorId: 'visitor-1',
  status: 'ACTIVE',
  validFrom: new Date(Date.now() - 60_000),
  validUntil: new Date(Date.now() + 60_000),
  credentialHash: createHash('sha256').update('secret').digest('hex'),
  visitor: { id: 'visitor-1', name: 'Test Visitor', status: 'APPROVED' },
};

type Overrides = Record<string, unknown>;

function service(overrides: Overrides = {}) {
  const prisma = {
    gate: { findFirst: vi.fn().mockResolvedValue({ id: 'gate-1', societyId: 'society-1', active: true }) },
    visitorPass: {
      findFirst: vi.fn().mockResolvedValue(pass),
      update: vi.fn().mockResolvedValue({ ...pass, checkedInAt: new Date() }),
    },
    visitor: { update: vi.fn().mockResolvedValue({ ...pass.visitor }) },
    ...overrides,
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  return {
    svc: new VisitorVerificationService(
      prisma as unknown as ConstructorParameters<typeof VisitorVerificationService>[0],
      audit as unknown as ConstructorParameters<typeof VisitorVerificationService>[1],
    ),
    prisma,
    audit,
  };
}

describe('VisitorVerificationService', () => {
  it('rejects a gate outside the tenant or inactive', async () => {
    const { svc } = service({ gate: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(svc.verify('society-1', 'gate-x', 'secret')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown credential', async () => {
    const { svc } = service({ visitorPass: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(svc.verify('society-1', 'gate-1', 'wrong')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a pass when the visitor is no longer approved', async () => {
    const { svc } = service({
      visitorPass: { findFirst: vi.fn().mockResolvedValue({ ...pass, visitor: { ...pass.visitor, status: 'CANCELLED' } }) },
    });
    await expect(svc.verify('society-1', 'gate-1', 'secret')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('checks in an active approved visitor and synchronizes visitor state', async () => {
    const { svc, prisma } = service();
    await svc.checkIn('society-1', 'gate-1', 'secret');
    expect(prisma.visitorPass.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'pass-1' },
      data: expect.objectContaining({ status: 'USED' }),
    }));
    expect(prisma.visitor.update).toHaveBeenCalledWith({
      where: { id: 'visitor-1' },
      data: { status: 'CHECKED_IN' },
    });
  });

  it('does not check out a pass already checked out', async () => {
    const { svc } = service({ visitorPass: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(svc.checkOut('society-1', 'gate-1', 'secret')).rejects.toBeInstanceOf(NotFoundException);
  });
});
