import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { SocietiesController } from './societies.controller';

const withDatabase = process.env.DATABASE_URL ? describe : describe.skip;
withDatabase('Society API compatibility on migrated PostgreSQL', () => {
  it('keeps list/create/detail response keys while the database supplies default ownership', async () => {
    const prisma = new PrismaService();
    const controller = new SocietiesController(prisma);
    const code = `compat-${randomUUID().slice(0, 12)}`.toUpperCase();
    const legacyKeys = ['id','name','code','status','productTier','featureOverrides','createdAt','updatedAt'].sort();
    try {
      const created = await controller.create({ name: 'Legacy society fixture', code });
      expect(Object.keys(created).sort()).toEqual(legacyKeys);
      expect(created).toMatchObject({ status: 'ACTIVE', productTier: 'STARTER', featureOverrides: {} });
      const detail = await controller.get(created.id, created.id);
      expect(Object.keys(detail).sort()).toEqual([...legacyKeys, 'buildings', 'gates'].sort());
      expect(detail).toMatchObject({ buildings: [], gates: [] });
      const listed = (await controller.list()).find(row => row.id === created.id);
      expect(Object.keys(listed ?? {}).sort()).toEqual(legacyKeys);
      expect(await prisma.society.findUniqueOrThrow({ where: { id: created.id }, select: { partnerId: true, ownershipVersion: true } }))
        .toEqual({ partnerId: '00000000-0000-4000-8000-000000000001', ownershipVersion: 1 });
    } finally {
      await prisma.society.deleteMany({ where: { code } });
      await prisma.$disconnect();
    }
  });
});
