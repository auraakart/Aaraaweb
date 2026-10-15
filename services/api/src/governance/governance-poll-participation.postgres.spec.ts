import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, UnitRelation } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { GovernancePollParticipationController } from './governance-poll-participation.controller';

const withDatabase = process.env.DATABASE_URL ? describe : describe.skip;
withDatabase('V5 community poll transactions on PostgreSQL', () => {
  it('preserves audiences and lifecycle while rejecting foreign polls/options and duplicate votes', async () => {
    const prisma = new PrismaService();
    const controller = new GovernancePollParticipationController(prisma);
    const societyA = randomUUID(), societyB = randomUUID();
    const owner = randomUUID(), tenant = randomUUID();
    const community = randomUUID(), owners = randomUUID(), foreign = randomUUID();
    const optionA = randomUUID(), optionOwners = randomUUID(), optionB = randomUUID();
    try {
      await prisma.society.createMany({ data: [
        { id: societyA, name: 'Poll A', code: `poll-${societyA}` },
        { id: societyB, name: 'Poll B', code: `poll-${societyB}` },
      ] });
      await prisma.user.createMany({ data: [
        { id: owner, phone: `poll-${owner}` }, { id: tenant, phone: `poll-${tenant}` },
      ] });
      const building = await prisma.building.create({ data: { societyId: societyA, name: 'Poll fixture', code: 'poll' } });
      const unit = await prisma.unit.create({ data: { societyId: societyA, buildingId: building.id, number: '1' } });
      const starts = new Date(Date.now() - 60_000);
      await prisma.unitOwnership.create({ data: { societyId: societyA, unitId: unit.id, userId: owner, verified: true, effectiveFrom: starts } });
      await prisma.unitOccupancy.create({ data: { societyId: societyA, unitId: unit.id, userId: tenant, relation: UnitRelation.TENANT, effectiveFrom: starts } });
      for (const [id, societyId, audience] of [[community, societyA, 'COMMUNITY'], [owners, societyA, 'OWNER_ONLY'], [foreign, societyB, 'COMMUNITY']]) {
        await prisma.$executeRaw(Prisma.sql`INSERT INTO "GovernancePoll" ("id","societyId","pollType","status","title","createdByUserId","audienceScope") VALUES (${id}::uuid,${societyId}::uuid,'SURVEY','OPEN','Poll fixture',${owner}::uuid,${audience})`);
      }
      for (const [id, pollId] of [[optionA, community], [optionOwners, owners], [optionB, foreign]]) {
        await prisma.$executeRaw(Prisma.sql`INSERT INTO "GovernancePollOption" ("id","pollId","ordinal","label") VALUES (${id}::uuid,${pollId}::uuid,1,'Yes')`);
      }
      expect(await controller.listAvailable(societyA, tenant)).toMatchObject([{ id: community }]);
      const ownerPolls = await controller.listAvailable(societyA, owner) as Array<{id:string}>;
      expect(ownerPolls.map(p => p.id).sort()).toEqual([community, owners].sort());
      await expect(controller.results(societyA, owner, foreign)).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.respond(societyA, owner, foreign, { optionId: optionB })).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.setStatus(societyA, foreign, { status: 'CLOSED' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.respond(societyA, tenant, owners, { optionId: optionOwners })).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.respond(societyA, tenant, community, { optionId: optionB })).rejects.toBeInstanceOf(BadRequestException);
      const attempts = await Promise.allSettled([
        controller.respond(societyA, tenant, community, { optionId: optionA }),
        controller.respond(societyA, tenant, community, { optionId: optionA }),
      ]);
      expect(attempts.filter(a => a.status === 'fulfilled')).toHaveLength(1);
      const rejected = attempts.find(a => a.status === 'rejected') as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(ConflictException);
      await expect(controller.results(societyA, tenant, community)).rejects.toBeInstanceOf(ConflictException);
      await controller.setStatus(societyA, community, { status: 'CLOSED' });
      await expect(controller.results(societyA, tenant, community)).resolves.toMatchObject({ pollId: community, totalResponses: 1, options: [{ id: optionA, responseCount: 1 }] });
      await expect(controller.setStatus(societyA, community, { status: 'OPEN' })).rejects.toBeInstanceOf(ConflictException);
      await prisma.unitOccupancy.updateMany({ where: { societyId: societyA, userId: tenant }, data: { active: false } });
      expect(await controller.listAvailable(societyA, tenant)).toEqual([]);
      await expect(controller.results(societyA, tenant, community)).rejects.toBeInstanceOf(BadRequestException);
      // Failed foreign operations did not alter the other society's poll or responses.
      const other = await prisma.$queryRaw<Array<{status:string;responses:number}>>(Prisma.sql`SELECT p."status",COUNT(r."id")::int AS responses FROM "GovernancePoll" p LEFT JOIN "GovernancePollResponse" r ON r."pollId"=p."id" WHERE p."id"=${foreign}::uuid GROUP BY p."id"`);
      expect(other).toEqual([{ status: 'OPEN', responses: 0 }]);
    } finally {
      try {
        await prisma.$executeRaw(Prisma.sql`DELETE FROM "GovernancePoll" WHERE "id" IN (${community}::uuid,${owners}::uuid,${foreign}::uuid)`);
        await prisma.society.deleteMany({ where: { id: { in: [societyA, societyB] } } });
        await prisma.user.deleteMany({ where: { id: { in: [owner, tenant] } } });
      } finally { await prisma.$disconnect(); }
    }
  });
});
