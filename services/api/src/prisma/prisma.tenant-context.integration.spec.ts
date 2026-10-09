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
});
