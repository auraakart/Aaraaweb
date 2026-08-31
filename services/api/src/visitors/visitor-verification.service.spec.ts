import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VisitorVerificationService } from './visitor-verification.service';
import { createHash } from 'node:crypto';

const pass = { id: 'pass-1', status: 'ACTIVE', validFrom: new Date(Date.now() - 60_000), validUntil: new Date(Date.now() + 60_000), credentialHash: createHash('sha256').update('secret').digest('hex'), visitor: { id: 'visitor-1', name: 'Test Visitor' } };

function service(overrides: any = {}) {
  const prisma: any = { gate: { findFirst: vi.fn().mockResolvedValue({ id: 'gate-1', societyId: 'society-1', active: true }), }, visitorPass: { findFirst: vi.fn().mockResolvedValue(pass), update: vi.fn().mockResolvedValue({ ...pass, checkedInAt: new Date() }) }, ...overrides };
  return { svc: new VisitorVerificationService(prisma), prisma };
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
  it('checks in an active pass', async () => {
    const { svc, prisma } = service();
    await svc.checkIn('society-1', 'gate-1', 'secret');
    expect(prisma.visitorPass.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'pass-1' }, data: expect.objectContaining({ status: 'USED' }) }));
  });
  it('does not check out a pass already checked out', async () => {
    const { svc } = service({ visitorPass: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(svc.checkOut('society-1', 'gate-1', 'secret')).rejects.toBeInstanceOf(NotFoundException);
  });
});
