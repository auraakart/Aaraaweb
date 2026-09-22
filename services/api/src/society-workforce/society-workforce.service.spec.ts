import { BadRequestException } from '@nestjs/common';
import { SocietyWorkerVerificationStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { SocietyWorkforceService } from './society-workforce.service';

function setup() {
  const prisma = {
    gate: { count: vi.fn() },
    societyWorker: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    societyWorkerGateAccess: { createMany: vi.fn(), deleteMany: vi.fn() },
    societyWorkerAttendance: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
  };
  return { prisma, service: new SocietyWorkforceService(prisma as unknown as PrismaService) };
}

describe('SocietyWorkforceService', () => {
  it('returns only verified gate-assigned workers that are inside their configured schedule', async () => {
    const { prisma, service } = setup();
    prisma.gate.count.mockResolvedValue(1);
    prisma.societyWorker.findMany.mockResolvedValue([
      {
        id: 'worker-a',
        name: 'Lakshmi',
        phone: '+919999999991',
        role: 'HOUSEKEEPING',
        department: 'HOUSEKEEPING',
        schedule: { days: ['TUE'], start: '08:00', end: '18:00' },
        attendances: [],
        gateAccesses: [{ gateId: 'gate-a' }],
      },
      {
        id: 'worker-b',
        name: 'Ravi',
        phone: '+919999999992',
        role: 'GARDENER',
        department: 'GARDENING',
        schedule: { days: ['WED'], start: '08:00', end: '18:00' },
        attendances: [],
        gateAccesses: [{ gateId: 'gate-a' }],
      },
    ]);

    const now = new Date('2026-09-22T05:00:00.000Z'); // Tuesday 10:30 IST
    const rows = await service.gateEligible('society-a', 'gate-a', undefined, now);

    expect(rows.map((row) => row.id)).toEqual(['worker-a']);
    expect(prisma.societyWorker.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        societyId: 'society-a',
        active: true,
        verification: SocietyWorkerVerificationStatus.VERIFIED,
        gateAccesses: { some: { societyId: 'society-a', gateId: 'gate-a', active: true } },
      }),
    }));
  });

  it('records an idempotent gate check-in only for an eligible worker', async () => {
    const { prisma, service } = setup();
    prisma.societyWorkerAttendance.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    vi.spyOn(service, 'gateEligible').mockResolvedValue([{ id: 'worker-a' }] as never);
    prisma.societyWorkerAttendance.create.mockResolvedValue({ id: 'attendance-a', workerId: 'worker-a' });

    const result = await service.checkIn(
      'society-a',
      '11111111-1111-4111-8111-111111111111',
      'worker-a',
      'guard-a',
      'idem-checkin-001',
      new Date('2026-09-22T05:00:00.000Z'),
    );

    expect(result).toEqual({ id: 'attendance-a', workerId: 'worker-a' });
    expect(prisma.societyWorkerAttendance.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        societyId: 'society-a',
        workerId: 'worker-a',
        checkInByUserId: 'guard-a',
        checkInKey: 'idem-checkin-001',
      }),
    }));
  });

  it('rejects check-in when the worker is not eligible at the selected gate', async () => {
    const { prisma, service } = setup();
    prisma.societyWorkerAttendance.findFirst.mockResolvedValueOnce(null);
    vi.spyOn(service, 'gateEligible').mockResolvedValue([]);

    await expect(service.checkIn(
      'society-a',
      '11111111-1111-4111-8111-111111111111',
      'worker-a',
      'guard-a',
      'idem-checkin-002',
    )).rejects.toThrow('not eligible at this gate');
    expect(prisma.societyWorkerAttendance.create).not.toHaveBeenCalled();
  });

  it('blocks suspension while the worker is still inside the society', async () => {
    const { prisma, service } = setup();
    prisma.societyWorker.findFirst.mockResolvedValue({
      id: 'worker-a',
      active: true,
      verification: SocietyWorkerVerificationStatus.VERIFIED,
    });
    prisma.societyWorkerAttendance.findFirst.mockResolvedValue({ id: 'attendance-a', checkedOutAt: null });

    await expect(service.suspend('society-a', 'worker-a')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.societyWorker.update).not.toHaveBeenCalled();
  });
});
