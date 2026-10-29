import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { GateAssignmentService } from './gate-assignment.service';

const withDatabase = process.env.DATABASE_URL ? describe : describe.skip;

withDatabase('V5 gate assignment tenant transactions on PostgreSQL', () => {
  it('preserves assignment windows and rejects foreign gates, users and deactivation targets', async () => {
    const prisma = new PrismaService();
    const service = new GateAssignmentService(prisma);
    const societyA = randomUUID(), societyB = randomUUID();
    const gateA = randomUUID(), gateB = randomUUID();
    const guardA = randomUUID(), guardB = randomUUID();
    const now = new Date();
    const startsAt = new Date(now.getTime() - 60_000);
    const endsAt = new Date(now.getTime() + 60_000);
    try {
      await prisma.society.createMany({ data: [
        { id: societyA, name: 'Gate fixture A', code: `gate-${societyA}` },
        { id: societyB, name: 'Gate fixture B', code: `gate-${societyB}` },
      ] });
      await prisma.gate.createMany({ data: [
        { id: gateA, societyId: societyA, name: 'Gate A', code: 'A' },
        { id: gateB, societyId: societyB, name: 'Gate B', code: 'B' },
      ] });
      await prisma.user.createMany({ data: [
        { id: guardA, phone: `gate-${guardA}` }, { id: guardB, phone: `gate-${guardB}` },
      ] });
      await prisma.societyMembership.createMany({ data: [
        { userId: guardA, societyId: societyA, role: MembershipRole.SECURITY_GUARD },
        { userId: guardB, societyId: societyB, role: MembershipRole.SECURITY_GUARD },
      ] });

      await expect(service.assign(societyA, gateB, guardA)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.list(societyA, gateB)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.assign(societyA, gateA, guardB)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.assign(societyA, gateA, guardA, undefined, new Date(0)))
        .rejects.toBeInstanceOf(BadRequestException);
      const assignment = await service.assign(societyA, gateA, guardA, startsAt, endsAt);
      expect(assignment).toMatchObject({ societyId: societyA, gateId: gateA, userId: guardA, active: true });
      await expect(service.assertAssigned(societyA, gateA, guardA, now)).resolves.toHaveProperty('id', assignment.id);
      await expect(service.assertAssigned(societyB, gateA, guardA, now)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.assertAssigned(societyA, gateA, guardA, endsAt)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.assertAssigned(societyA, gateA, guardA, new Date(startsAt.getTime() - 1))).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.deactivate(societyB, gateB, assignment.id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.assertAssigned(societyA, gateA, guardA, now)).resolves.toHaveProperty('id', assignment.id);

      await prisma.gate.update({ where: { id: gateA }, data: { active: false } });
      await expect(service.assertAssigned(societyA, gateA, guardA, now)).rejects.toBeInstanceOf(ForbiddenException);
      await prisma.gate.update({ where: { id: gateA }, data: { active: true } });
      expect(await service.list(societyA, gateA)).toMatchObject([{ id: assignment.id, userId: guardA }]);
      await expect(service.deactivate(societyA, gateA, assignment.id)).resolves.toHaveProperty('active', false);
      await expect(service.assertAssigned(societyA, gateA, guardA, now)).rejects.toBeInstanceOf(ForbiddenException);
    } finally {
      try {
        await prisma.society.deleteMany({ where: { id: { in: [societyA, societyB] } } });
        await prisma.user.deleteMany({ where: { id: { in: [guardA, guardB] } } });
      } finally {
        await prisma.$disconnect();
      }
    }
  });
});
