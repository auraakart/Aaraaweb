import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { PrismaService, TENANT_CONTEXT_SETTING } from './prisma.service';

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase('PrismaService tenant context PostgreSQL integration', () => {
  const prisma = new PrismaService();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function readContext(client: Pick<Prisma.TransactionClient, '$queryRaw'>) {
    const rows = await client.$queryRaw<Array<{ societyId: string | null }>>(
      Prisma.sql`SELECT current_setting(${TENANT_CONTEXT_SETTING}, true) AS "societyId"`,
    );
    return rows[0]?.societyId ?? null;
  }

  it('keeps society context transaction-local across sequential tenant work', async () => {
    const societyA = '11111111-1111-4111-8111-111111111111';
    const societyB = '22222222-2222-4222-8222-222222222222';

    const insideA = await prisma.withTenantContext(societyA, (tx) => readContext(tx));
    const afterA = await readContext(prisma);
    const insideB = await prisma.withTenantContext(societyB, (tx) => readContext(tx));
    const afterB = await readContext(prisma);

    expect(insideA).toBe(societyA);
    expect(insideB).toBe(societyB);
    expect(afterA).not.toBe(societyA);
    expect(afterB).not.toBe(societyB);
  });

  it('clears rolled-back tenant context before subsequent pooled work', async () => {
    const failedSociety = '11111111-1111-4111-8111-111111111111';
    const nextSociety = '22222222-2222-4222-8222-222222222222';
    await expect(prisma.withTenantContext(failedSociety, async tx => {
      expect(await readContext(tx)).toBe(failedSociety);
      throw new Error('rollback fixture');
    })).rejects.toThrow('rollback fixture');
    expect(await readContext(prisma)).not.toBe(failedSociety);
    expect(await prisma.withTenantContext(nextSociety, tx => readContext(tx))).toBe(nextSociety);
    expect(await readContext(prisma)).not.toBe(nextSociety);
  });

  it('does not open a database transaction for a malformed society id', async () => {
    let invoked = false;
    await expect(
      prisma.withTenantContext('not-a-society-uuid', async () => {
        invoked = true;
        return true;
      }),
    ).rejects.toThrow('A valid society UUID is required for tenant database context');
    expect(invoked).toBe(false);
  });

  it('keeps interleaved societies isolated under concurrent tenant transactions', async () => {
    // Concurrent promises exercise multiple pooled connections when the pool permits,
    // while remaining valid when CI uses a single connection.
    const societyIds = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ];
    const expected = Array.from({ length: 12 }, (_, index) => societyIds[index % societyIds.length]);
    const observed = await Promise.all(expected.map(societyId =>
      prisma.withTenantContext(societyId, async tx => {
        expect(await readContext(tx)).toBe(societyId);
        await tx.$queryRaw(Prisma.sql`SELECT 1::int AS "ok" FROM pg_sleep(0.003)`);
        return readContext(tx);
      }),
    ));

    expect(observed).toEqual(expected);
    expect(societyIds).not.toContain(await readContext(prisma));
  });

  it('clears transaction-local context after a PostgreSQL statement failure', async () => {
    const failedSociety = '11111111-1111-4111-8111-111111111111';
    const nextSociety = '22222222-2222-4222-8222-222222222222';

    await expect(prisma.withTenantContext(failedSociety, async tx => {
      expect(await readContext(tx)).toBe(failedSociety);
      await tx.$queryRaw(Prisma.sql`SELECT 1 / 0 AS "failure"`);
      return 'unexpected-success';
    })).rejects.toThrow();

    expect(await readContext(prisma)).not.toBe(failedSociety);
    expect(await prisma.withTenantContext(nextSociety, tx => readContext(tx))).toBe(nextSociety);
    expect(await readContext(prisma)).not.toBe(nextSociety);
  });
});
